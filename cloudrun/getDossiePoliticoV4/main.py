"""getDossiePoliticoV4

Cloud Run HTTP service (Gemini 2.5 Pro) para gerar dossiê Aurora em tom
investigativo, com compliance jurídico e base exclusiva em dados públicos.
"""

from __future__ import annotations

import json
import os
from typing import Any

from flask import Flask, jsonify, request
from google import genai
from google.cloud import bigquery
from google.genai import types

PROJECT_ID = os.getenv("VERTEX_PROJECT_ID", "projeto-codex-br")
BQ_PROJECT_ID = os.getenv("BQ_PROJECT_ID", "transparenciabr")
BQ_DATASET = os.getenv("BQ_DATASET", "transparenciabr")
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")

app = Flask(__name__)
bq_client = bigquery.Client(project=BQ_PROJECT_ID)
genai_client = genai.Client(vertexai=True, project=PROJECT_ID, location="us-central1")


def _run_query(sql: str, params: list[bigquery.ScalarQueryParameter]) -> list[dict[str, Any]]:
    job_cfg = bigquery.QueryJobConfig(query_parameters=params)
    rows = bq_client.query(sql, job_config=job_cfg).result()
    return [dict(row.items()) for row in rows]


def load_public_bundle(parlamentar_query: str) -> dict[str, Any]:
    params = [bigquery.ScalarQueryParameter("q", "STRING", f"%{parlamentar_query}%")]

    profile = _run_query(
        f"""
        SELECT *
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.vw_score_parlamentar`
        WHERE LOWER(nome_completo) LIKE LOWER(@q)
        ORDER BY score_asmodeus DESC
        LIMIT 1
        """,
        params,
    )

    ceap = _run_query(
        f"""
        SELECT
          autor,
          COUNT(*) AS notas_total,
          SUM(IFNULL(valor_documento, 0)) AS valor_total,
          AVG(IFNULL(valor_documento, 0)) AS valor_medio,
          MAX(IFNULL(valor_documento, 0)) AS maior_nota
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.ceap_despesas`
        WHERE LOWER(autor) LIKE LOWER(@q)
        GROUP BY autor
        ORDER BY valor_total DESC
        LIMIT 1
        """,
        params,
    )

    emendas = _run_query(
        f"""
        SELECT
          autor,
          COUNT(*) AS emendas_total,
          SUM(IFNULL(valorEmpenhado, 0)) AS total_empenhado,
          SUM(IFNULL(valorPago, 0)) AS total_pago,
          COUNT(DISTINCT municipio) AS municipios
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.emendas`
        WHERE LOWER(autor) LIKE LOWER(@q)
        GROUP BY autor
        ORDER BY total_empenhado DESC
        LIMIT 1
        """,
        params,
    )

    benford = _run_query(
        f"""
        SELECT *
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.vw_benford_ceap_audit`
        WHERE LOWER(nome_parlamentar) LIKE LOWER(@q)
        ORDER BY score_benford DESC
        LIMIT 20
        """,
        params,
    )

    zscore = _run_query(
        f"""
        SELECT *
        FROM `{BQ_PROJECT_ID}.{BQ_DATASET}.vw_ceap_zscore_roll`
        WHERE LOWER(nome_parlamentar) LIKE LOWER(@q)
        ORDER BY ABS(zscore_roll) DESC
        LIMIT 30
        """,
        params,
    )

    return {
        "profile": profile,
        "ceap": ceap,
        "emendas": emendas,
        "benford": benford,
        "zscore": zscore,
    }


def build_prompt(parlamentar_query: str, bundle: dict[str, Any]) -> str:
    return f"""
Você é o Aurora Forensic Writer (compliance-first).

MISSÃO:
Gerar um Dossiê Aurora MATADOR para "{parlamentar_query}".

REGRAS OBRIGATÓRIAS DE TOM:
- Linguagem investigativa forte, com energia máxima.
- Nunca acusar crime diretamente.
- Use formulações como:
  "chama atenção", "gera inconsistência", "merece investigação",
  "os números não batem", "padrão que levanta suspeitas",
  "os dados públicos mostram".
- Sempre separar FATOS (dados) de HIPÓTESES (investigação sugerida).

COMPLIANCE:
- Basear tudo apenas em dados públicos recebidos no payload.
- Incluir disclaimer de presunção de inocência e direito de resposta.
- Não inventar fonte, valor ou evento.

ITENS OBRIGATÓRIOS NO TEXTO:
1) Resumo executivo em 8-12 bullets.
2) Score geral com explicação da fórmula de risco (vw_score_parlamentar / score_asmodeus).
3) CEAP: volume, ticket médio, picos e padrões estatísticos.
4) Emendas: total empenhado/pago, concentração territorial e sinais de inconsistência.
5) Benford + outliers z-score: principais achados.
6) Seção "Custo por voto (TSE)":
   - Se não houver dado no payload, declarar explicitamente "dado indisponível nesta versão".
7) Seção "Pesquisas 2026 (Atlas + trackers)":
   - Se não houver dado no payload, declarar explicitamente "dado indisponível nesta versão".
8) Checklist de investigação (10 ações práticas para auditoria externa).
9) Conclusão dura no tom investigativo, mas sem acusação.

DADOS PÚBLICOS (JSON):
{json.dumps(bundle, ensure_ascii=False)}
""".strip()


def generate_dossier_text(parlamentar_query: str, bundle: dict[str, Any]) -> str:
    prompt = build_prompt(parlamentar_query, bundle)
    response = genai_client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.3,
            top_p=0.9,
            max_output_tokens=8192,
        ),
    )
    return (response.text or "").strip()


@app.get("/healthz")
def healthz():
    return jsonify({"ok": True, "service": "getDossiePoliticoV4"})


@app.get("/")
def get_dossie_v4():
    parlamentar_query = str(request.args.get("q", "")).strip()
    if not parlamentar_query:
        return jsonify({"error": "param q é obrigatório"}), 400

    try:
        bundle = load_public_bundle(parlamentar_query)
        dossier = generate_dossier_text(parlamentar_query, bundle)
    except Exception as exc:  # pragma: no cover - runtime handling
        return jsonify({"error": str(exc), "query": parlamentar_query}), 500

    return jsonify(
        {
            "query": parlamentar_query,
            "model": MODEL_NAME,
            "bundle_keys": list(bundle.keys()),
            "dossier_text": dossier,
            "disclaimer": (
                "Os dados públicos mostram padrões que podem merecer investigação. "
                "Este relatório não imputa culpa nem substitui apuração oficial. "
                "Direito de resposta preservado."
            ),
        }
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8080")))
