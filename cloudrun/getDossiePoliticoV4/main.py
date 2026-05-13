# getDossiePoliticoV4 — Cloud Run (Gemini 2.5 Pro)
# Fan-out factual (BigQuery + Vertex Search opcional) + laudo inferno (tom de suspeita, compliance).

from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import functions_framework
from flask import Request
from google.cloud import bigquery

try:
    import vertexai
    from vertexai.generative_models import GenerativeModel
except ImportError:  # pragma: no cover
    vertexai = None
    GenerativeModel = None

BQ_PROJECT = os.environ.get("BQ_PROJECT_ID", "transparenciabr")
VERTEX_PROJECT = os.environ.get("VERTEX_PROJECT_ID", BQ_PROJECT)
VERTEX_LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")

AURORA_AGENTS = [
    "Benford Sentinel",
    "Anomaly Oracle",
    "Payroll Integrity",
    "Public Health Watch",
    "Nepotism Crosslink",
    "Emenda Deviation Analyst",
    "Atlas Poll Tracker",
    "TSE Electoral Economist",
    "CEAP Velocity Auditor",
    "PNCP Graph Walker",
    "IDH Municipio Comparator",
    "RAIS CNPJ Matcher",
    "Supreme Maestro Compiler",
    "Compliance Gatekeeper",
    "Transferegov PIX Sentinel",
    "Atlas Brasil Demographer",
]

bq_client = bigquery.Client(project=BQ_PROJECT)


def _bq(sql: str, params: dict[str, Any]) -> list[dict[str, Any]] | dict[str, Any]:
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter(k, "STRING", v) for k, v in params.items()
        ]
    )
    try:
        rows = bq_client.query(sql, job_config=job_config, location="US").result()
        return [dict(r) for r in rows]
    except Exception as exc:  # pragma: no cover
        return {"error": str(exc)}


def _gather_facts(nome: str) -> dict[str, Any]:
    nome_like = f"%{nome.strip()}%"
    ceap_sql = f"""
    SELECT
      parlamentar_id,
      autor AS nome,
      COUNT(*) AS n_documentos,
      ROUND(SUM(IFNULL(valor_documento,0)), 2) AS total_gasto,
      ROUND(AVG(IFNULL(valor_documento,0)), 2) AS gasto_medio,
      ROUND(MAX(IFNULL(valor_documento,0)), 2) AS maior_gasto,
      MIN(data_emissao) AS primeira_despesa,
      MAX(data_emissao) AS ultima_despesa
    FROM `{BQ_PROJECT}.transparenciabr.ceap_despesas`
    WHERE LOWER(autor) LIKE LOWER(@nome)
    GROUP BY parlamentar_id, autor
    ORDER BY total_gasto DESC
    LIMIT 5
    """
    emendas_sql = f"""
    SELECT
      autor AS nome,
      COUNT(*) AS n_emendas,
      ROUND(SUM(IFNULL(valorEmpenhado,0)), 2) AS total_empenhado,
      ROUND(SUM(IFNULL(valorPago,0)), 2) AS total_pago,
      COUNT(DISTINCT municipio) AS municipios_atendidos,
      COUNT(DISTINCT estado) AS estados_atendidos
    FROM `{BQ_PROJECT}.transparenciabr.emendas`
    WHERE LOWER(autor) LIKE LOWER(@nome)
    GROUP BY autor
    ORDER BY total_empenhado DESC
    LIMIT 5
    """
    benford_sql = f"""
    SELECT *
    FROM `{BQ_PROJECT}.transparenciabr.vw_benford_ceap_audit`
    WHERE parlamentar_id IN (
      SELECT DISTINCT parlamentar_id
      FROM `{BQ_PROJECT}.transparenciabr.ceap_despesas`
      WHERE LOWER(autor) LIKE LOWER(@nome)
      LIMIT 5
    )
    LIMIT 50
    """
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = {
            pool.submit(_bq, ceap_sql, {"nome": nome_like}): "ceap_despesas",
            pool.submit(_bq, emendas_sql, {"nome": nome_like}): "emendas",
            pool.submit(_bq, benford_sql, {"nome": nome_like}): "benford_audit",
        }
        out: dict[str, Any] = {}
        for fut, key in futs.items():
            out[key] = fut.result()
    return out


def _build_prompt(query: str, facts: dict[str, Any]) -> str:
    agents = ", ".join(AURORA_AGENTS)
    payload = json.dumps(facts, ensure_ascii=False, default=str)[:120_000]
    return f"""Você é o motor Aurora MATADOR (Inferno) — auditor de transparência pública brasileira.
Modelo obrigatório de raciocínio: consolide sinais dos 16 agentes nomeados: {agents}.

REGRAS DE TOM (obrigatórias):
- Agressivo na suspeita, nunca acusando diretamente crime ou ilícito.
- Use expressões como: "chama atenção", "gera inconsistência", "merece investigação",
  "os números não batem", "padrão que levanta suspeitas", "os dados públicos mostram".
- Linguagem forte e investigativa, mas 100% ancorada nos fatos JSON abaixo + fontes oficiais.

CONTEÚDO ANALÍTICO OBRIGATÓRIO (quando houver dado):
- Votos na última eleição e custo por voto (TSE) — se ausente no JSON, declare lacuna honesta.
- Pesquisas intenção 2026 (Atlas + trackers) — se ausente, cite ausência de série na carga atual.
- Métricas agregadas CEAP/emendas/Benford: destaque onde "os números não batem" vs mediana esperada em discurso técnico.
- Análise de DESVIO de emendas: hipóteses (empresas de parentes, municípios sem relação geográfica, padrões de desvio,
  cruzamento RAIS/CNPJ) apenas como perguntas de investigação, sem sentença.
- NEPOTISMO CRUZADO: parentesco entre parlamentares e beneficiários — somente como verificação sugerida se o JSON não provar vínculo.

DISCLAIMER fixo no final do texto:
"Material produzido a partir de bases públicas. Não substitui apuração de órgãos de controle. Direito de resposta assegurado."

Parlamentar / consulta: {query}

FATOS (BigQuery / agregados):
{payload}

Responda em Markdown, seções curtas, bullets quando útil. Cite explicitamente as fontes (TSE, Câmara, Portal da Transparência, PNCP, etc.) ao lado de cada bloco.
"""


def _gemini_inferno_markdown(prompt: str) -> dict[str, Any]:
    if not vertexai or not GenerativeModel:
        return {
            "markdown": "Vertex AI SDK indisponível neste deploy — retornando apenas fatos BigQuery.",
            "model": None,
        }
    vertexai.init(project=VERTEX_PROJECT, location=VERTEX_LOCATION)
    model = GenerativeModel(GEMINI_MODEL)
    resp = model.generate_content(
        prompt,
        generation_config={
            "temperature": 0.15,
            "max_output_tokens": 8192,
        },
    )
    text = (resp.text or "").strip()
    return {"markdown": text, "model": GEMINI_MODEL}


@functions_framework.http
def getDossiePoliticoV4(request: Request):
    if request.method == "OPTIONS":
        return ("", 204, _cors_headers())

    q = (request.args.get("q") or (request.get_json(silent=True) or {}).get("q") or "").strip()
    if not q:
        body = {"error": "param q obrigatorio"}
        return (json.dumps(body), 400, _cors_headers_json())

    t0 = time.time()
    facts = _gather_facts(q)
    prompt = _build_prompt(q, facts)
    laudo = _gemini_inferno_markdown(prompt)

    body = {
        "query": q,
        "timing_ms": int((time.time() - t0) * 1000),
        "bigquery": facts,
        "laudo_inferno": laudo,
        "agentes_aurora": AURORA_AGENTS,
        "disclaimer": (
            "Toda nota é suspeita até prova contrária. Indícios quantitativos derivados de dados públicos — "
            "não configuram ilícito nem substituem apuração oficial. Direito de resposta assegurado."
        ),
    }
    return (json.dumps(body, ensure_ascii=False), 200, _cors_headers_json())


def _cors_headers():
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }


def _cors_headers_json():
    h = _cors_headers()
    h["Content-Type"] = "application/json; charset=utf-8"
    return h
