#!/usr/bin/env python3
"""
Engine 28 — Classificador CEAP via Vertex AI (Gemini 2.5)

ARQUITETURA CROSS-PROJECT:
  - Leitura de dados: BigQuery → projeto 'transparenciabr', dataset 'tbr_ceap', tabela 'ceap_despesas_ext'
    + dataset 'transparenciabr', tabela 'emendas' (corte forense por autor)
    + atividade legislativa: API pública Câmara (proposições) — não há tabela BQ canônica no repo
  - IA (Gemini 2.5): Vertex AI → projeto 'projeto-codex-br' (créditos R$ 5.952)
  - Escrita de resultados: Firestore → projeto 'transparenciabr'
    * Coleção 'transparency_reports/{deputado_id}' → campo 'classificacao_ia'
    * Mesmo documento → 'auditoria_asmodeus_triade' (cérebro CEAP×Emendas×Mandato, JSON estrito)
    * Coleção 'alertas_bodes' → alertas individuais por nota

FLUXO:
  1. Consulta BigQuery para obter todas as notas CEAP de um parlamentar (ou batch)
  2. Monta envelope único: resumo CEAP + emendas (BQ) + proposições (API Câmara)
  3. Passagem Vertex com system instruction A.S.M.O.D.E.U.S. (auditoria tripartite → JSON Firestore)
  4. Agrupa notas em lotes de 10 (para otimizar tokens e custo)
  5. Envia cada lote ao Gemini 2.5 Flash (via Vertex AI, billing em projeto-codex-br)
  6. Gemini classifica cada nota: risco (baixo/médio/alto/crítico), justificativa, flags
  7. Grava classificações em Firestore (transparency_reports + alertas_bodes)
  8. Opcionalmente grava em BigQuery (tabela ceap_despesas_classificadas)

CUSTO ESTIMADO:
  - ~10 notas por request, ~500 tokens input + ~200 tokens output por nota
  - Kim Kataguiri (1.428 notas): ~143 requests × ~$0.0005 = ~$0.07 (R$ 0,40)
  - Batch 630 parlamentares: ~R$ 250 total

USO:
  # Piloto (1 parlamentar)
  python3 engines/28_ceap_vertex_classifier.py --deputado-id 204536

  # Batch (todos com dados no BigQuery)
  python3 engines/28_ceap_vertex_classifier.py --batch --max-concurrent 4

  # Dry-run (sem gravar, só mostra classificações)
  python3 engines/28_ceap_vertex_classifier.py --deputado-id 204536 --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import gcp_project_id, bq_dataset_id, vertex_project_id, vertex_location
from lib.resilience import call_with_exponential_backoff

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | engine=28_vertex_classifier | %(message)s",
)
logger = logging.getLogger("transparenciabr.engine28")

# ---------------------------------------------------------------------------
# Constantes
# ---------------------------------------------------------------------------

VERTEX_MODEL = os.environ.get("VERTEX_MODEL", "gemini-2.5-flash-preview-05-20")
BATCH_SIZE = 10  # notas por request ao Gemini
MAX_NOTAS_PER_PARLAMENTAR = 2000  # limite de segurança

LEGAL_DISCLAIMER = (
    "Classificação automática baseada em padrões estatísticos e semânticos — "
    "não configura acusação nem substitui apuração oficial."
)

CLASSIFICATION_PROMPT = """Você é um auditor forense especializado em CEAP (Cota para Exercício da Atividade Parlamentar).

Analise as seguintes notas fiscais de um parlamentar e classifique CADA UMA individualmente.

Para cada nota, retorne um JSON com:
- "idx": número sequencial da nota (começando em 0)
- "risco": "baixo" | "medio" | "alto" | "critico"
- "score": número de 0 a 100 (0=sem risco, 100=altamente suspeito)
- "flags": lista de strings com os indicadores detectados (ex: ["valor_redondo", "fornecedor_concentrado", "descricao_vaga"])
- "justificativa": frase curta (max 100 chars) explicando a classificação
- "categoria_suspeita": null ou uma de ["superfaturamento", "nota_fria", "desvio_finalidade", "fracionamento", "duplicidade", "conflito_interesse"]

FLAGS POSSÍVEIS:
- valor_redondo: valor termina em 000 ou é múltiplo exato de 1000
- valor_alto: acima de R$ 10.000 para a categoria
- fornecedor_concentrado: mesmo fornecedor aparece muitas vezes
- descricao_vaga: descrição genérica que não permite verificar o serviço
- trecho_inconsistente: passagem aérea com trecho que não faz sentido geográfico
- fim_de_semana: despesa em dia não útil
- sem_documento: número do documento ausente ou inválido
- consultorias_genericas: consultoria sem especificação do trabalho

Responda APENAS com um array JSON válido. Sem markdown, sem explicação fora do JSON.

NOTAS PARA CLASSIFICAR:
{notas_json}
"""

# Cérebro tripartite (CEAP × Emendas × Atividade) — alinhado ao callable on-demand (Caso Gilson).
SYSTEM_INSTRUCTION_ASMODEUS = """
Você é o braço de inteligência analítica do ecossistema A.S.M.O.D.E.U.S.
Sua tarefa nesta varredura em lote é processar os payloads consolidados dos parlamentares.

Para cada registro, você deve gerar uma classificação tripartite (ILEGAL, IMORAL, SUSPEITO) cobrindo:
1. Irregularidades em notas fiscais e CPFs de terceiros na CEAP.
2. Desvio de finalidade em Emendas Parlamentares, cruzando dados de empenho com execuções reais mapeadas via Diários Oficiais e PNCP.
3. Discrepâncias graves entre a presença real (atividade) e o volume de ressarcimentos logísticos requisitados.

Seu output deve ser estruturado em JSON estrito para alimentação direta do Firestore.
"""


# ---------------------------------------------------------------------------
# BigQuery Reader
# ---------------------------------------------------------------------------

def get_bq_client():
    """Inicializa BigQuery client apontando para projeto transparenciabr."""
    from google.cloud import bigquery
    return bigquery.Client(project=gcp_project_id())


def fetch_notas_bq(deputado_id: str, bq_client=None) -> List[Dict[str, Any]]:
    """Busca todas as notas CEAP de um parlamentar no BigQuery."""
    if bq_client is None:
        bq_client = get_bq_client()

    # ceap_despesas_ext usa ide_cadastro (= ID API Câmara) como string
    query = f"""
    SELECT
        ide_cadastro,
        ide_documento,
        tx_nome_parlamentar,
        sg_partido,
        sg_uf,
        txt_fornecedor,
        txt_cnpjcpf,
        txt_descricao,
        txt_descricao_especificacao,
        txt_numero,
        txt_passageiro,
        txt_trecho,
        dat_emissao,
        num_mes,
        num_ano,
        num_sub_cota,
        vlr_documento,
        vlr_liquido,
        vlr_glosa,
        url_documento,
        nu_deputado_id
    FROM `{gcp_project_id()}.tbr_ceap.ceap_despesas_ext`
    WHERE ide_cadastro = '{deputado_id}'
    ORDER BY CAST(vlr_documento AS FLOAT64) DESC
    LIMIT {MAX_NOTAS_PER_PARLAMENTAR}
    """

    results = bq_client.query(query).result()
    rows = [dict(row) for row in results]
    logger.info("BigQuery: %d notas para deputado %s", len(rows), deputado_id)
    return rows


def fetch_all_deputados_bq(bq_client=None) -> List[str]:
    """Busca todos os IDs de parlamentares distintos no BigQuery."""
    if bq_client is None:
        bq_client = get_bq_client()

    query = f"""
    SELECT DISTINCT ide_cadastro
    FROM `{gcp_project_id()}.tbr_ceap.ceap_despesas_ext`
    WHERE ide_cadastro IS NOT NULL AND ide_cadastro != ''
    ORDER BY ide_cadastro
    """

    results = bq_client.query(query).result()
    ids = [row["ide_cadastro"] for row in results]
    logger.info("BigQuery: %d parlamentares distintos encontrados", len(ids))
    return ids


def fetch_emendas_bq(nome_parlamentar: str, bq_client) -> List[Dict[str, Any]]:
    """Emendas parlamentares (mesmo núcleo lógico do datalake Node / getDossieAurora)."""
    nome = (nome_parlamentar or "").strip()
    if not nome:
        return []
    from google.cloud import bigquery

    pid = gcp_project_id()
    ds = bq_dataset_id()
    query = f"""
      SELECT autor, descricao,
             CAST(valorEmpenhado AS FLOAT64) AS valorEmpenhado,
             CAST(valorPago AS FLOAT64) AS valorPago,
             funcao, subfuncao, municipio, estado, ano
      FROM `{pid}.{ds}.emendas`
      WHERE LOWER(autor) LIKE CONCAT('%', LOWER(@nome), '%')
      ORDER BY valorEmpenhado DESC
      LIMIT 120
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("nome", "STRING", nome)],
    )
    rows = list(bq_client.query(query, job_config=job_config, location="US").result())
    out = [dict(r) for r in rows]
    logger.info("BigQuery emendas: %d linhas para %s", len(out), nome[:48])
    return out


def fetch_proposicoes_camara(deputado_id: str, timeout: float = 14.0) -> Dict[str, Any]:
    """
    Proposições recentes (API dados abertos Câmara).
    Não há tabela canônica de proposições no BQ neste repositório; a API cobre o pilar legislativo.
    """
    import urllib.request

    dep = str(deputado_id).strip()
    if not dep.isdigit():
        return {"fonte": "api_camara", "proposicoes": [], "nota": "id_nao_numerico"}
    url = (
        f"https://dadosabertos.camara.leg.br/api/v2/deputados/{dep}/proposicoes"
        "?itens=40&ordem=DESC&ordenarPor=id"
    )
    try:
        req = urllib.request.Request(
            url,
            headers={"Accept": "application/json", "User-Agent": "TransparenciaBR-Engine28/1.0"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        dados = data.get("dados") or []
        slim = [
            {
                "id": x.get("id"),
                "siglaTipo": x.get("siglaTipo"),
                "numero": x.get("numero"),
                "ano": x.get("ano"),
                "ementa": str(x.get("ementa") or "")[:500],
            }
            for x in dados[:40]
        ]
        return {"fonte": "api_camara", "proposicoes": slim}
    except Exception as exc:  # pragma: no cover - rede
        return {"fonte": "api_camara", "proposicoes": [], "erro": str(exc)[:240]}


def build_consolidated_payload(
    deputado_id: str,
    nome: str,
    notas: List[Dict[str, Any]],
    bq_client,
) -> Dict[str, Any]:
    """Envelope único: CEAP (amostra agregada) + emendas BQ + atividade (API)."""
    top_fn: Dict[str, float] = {}
    for n in notas[:800]:
        cnpj = str(n.get("txt_cnpjcpf") or "").strip()
        fn = str(n.get("txt_fornecedor") or "").strip()[:120]
        key = cnpj or fn
        if not key:
            continue
        top_fn[key] = top_fn.get(key, 0.0) + float(n.get("vlr_documento") or 0)
    top_pairs = sorted(top_fn.items(), key=lambda x: x[1], reverse=True)[:30]
    emendas = fetch_emendas_bq(nome, bq_client)
    atividade = fetch_proposicoes_camara(deputado_id)
    total_val = sum(float(n.get("vlr_documento") or 0) for n in notas)
    return {
        "deputado_id": deputado_id,
        "nome_parlamentar": nome,
        "ceap_resumo": {
            "total_notas": len(notas),
            "total_valor_brl": round(total_val, 2),
            "top_cnpj_ou_fornecedor": [
                {"chave": k, "total_brl": round(v, 2)} for k, v in top_pairs
            ],
        },
        "emendas_bq": emendas,
        "atividade_legislativa": atividade,
    }


def audit_asmodeus_triade(
    consolidated: Dict[str, Any],
    model_tuple: Tuple[str, Any],
) -> Optional[Dict[str, Any]]:
    """Uma passagem Vertex com system instruction tripartite → JSON Firestore."""
    model_type, model = model_tuple
    payload = json.dumps(consolidated, ensure_ascii=False, default=str)[:95_000]
    user_prompt = (
        "Dados consolidados (um único objeto JSON — CEAP resumo, emendas BQ, atividade legislativa):\n"
        f"{payload}\n\n"
        "Gere APENAS JSON válido, sem markdown, exatamente neste schema:\n"
        '{"registro":{"deputado_id":"string","nome_parlamentar":"string"},'
        '"avaliacoes":['
        '{"eixo":"CEAP|EMENDAS|ATIVIDADE","nivel":"ILEGAL|IMORAL|SUSPEITO",'
        '"sintese":"string","detalhe":"string"}],'
        '"disclaimer":"string"}\n'
        "Inclua pelo menos uma linha em avaliacoes para cada eixo com evidência nos dados; "
        'se faltar dado para um eixo, use nivel SUSPEITO e sintese "lacuna de dado público neste eixo".'
    )

    def _parse_model_json(text: str) -> Dict[str, Any]:
        t = text.strip()
        if t.startswith("```"):
            t = t.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(t)

    def _call():
        if model_type == "vertexai":
            import vertexai
            from vertexai.generative_models import GenerativeModel, GenerationConfig

            vertexai.init(project=vertex_project_id(), location=vertex_location())
            tri = GenerativeModel(
                VERTEX_MODEL,
                system_instruction=SYSTEM_INSTRUCTION_ASMODEUS,
                generation_config=GenerationConfig(
                    temperature=0.15,
                    max_output_tokens=8192,
                    response_mime_type="application/json",
                ),
            )
            response = tri.generate_content(user_prompt)
            return _parse_model_json(response.text or "{}")

        combined = SYSTEM_INSTRUCTION_ASMODEUS + "\n\n" + user_prompt
        response = model.models.generate_content(
            model=VERTEX_MODEL,
            contents=combined,
        )
        return _parse_model_json(response.text or "{}")

    def _is_retriable(exc: BaseException) -> bool:
        msg = str(exc).lower()
        return any(s in msg for s in ("429", "500", "502", "503", "504", "timeout", "deadline", "quota"))

    try:
        return call_with_exponential_backoff(
            _call,
            max_attempts=3,
            retry_on=_is_retriable,
            base_sec=3.0,
            max_sec=45.0,
        )
    except Exception as exc:
        logger.warning("audit_asmodeus_triade falhou: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Vertex AI Classifier
# ---------------------------------------------------------------------------

def get_vertex_model():
    """Inicializa o modelo Gemini via Vertex AI no projeto-codex-br."""
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel, GenerationConfig
    except ImportError:
        # Fallback para google-genai SDK
        from google import genai
        client = genai.Client(
            vertexai=True,
            project=vertex_project_id(),
            location=vertex_location(),
        )
        return ("genai", client)

    vertexai.init(project=vertex_project_id(), location=vertex_location())
    model = GenerativeModel(
        VERTEX_MODEL,
        generation_config=GenerationConfig(
            temperature=0.1,
            max_output_tokens=4096,
            response_mime_type="application/json",
        ),
    )
    return ("vertexai", model)


def classify_batch(notas: List[Dict[str, Any]], model_tuple) -> List[Dict[str, Any]]:
    """Classifica um lote de notas via Gemini 2.5."""
    # Preparar contexto compacto para cada nota
    notas_compact = []
    for i, nota in enumerate(notas):
        notas_compact.append({
            "idx": i,
            "fornecedor": nota.get("txt_fornecedor", ""),
            "cnpj": nota.get("txt_cnpjcpf", ""),
            "descricao": nota.get("txt_descricao", ""),
            "especificacao": nota.get("txt_descricao_especificacao", ""),
            "valor": float(nota.get("vlr_documento", 0) or 0),
            "data": str(nota.get("dat_emissao", "")),
            "trecho": nota.get("txt_trecho", ""),
            "passageiro": nota.get("txt_passageiro", ""),
            "num_documento": nota.get("txt_numero", ""),
        })

    prompt = CLASSIFICATION_PROMPT.format(notas_json=json.dumps(notas_compact, ensure_ascii=False))

    model_type, model = model_tuple

    def _call():
        if model_type == "vertexai":
            response = model.generate_content(prompt)
            text = response.text
        else:
            # google-genai SDK
            response = model.models.generate_content(
                model=VERTEX_MODEL,
                contents=prompt,
            )
            text = response.text

        # Parse JSON response
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(text)

    def _is_retriable(exc):
        msg = str(exc).lower()
        return any(s in msg for s in ("429", "500", "502", "503", "504", "timeout", "deadline", "quota"))

    result = call_with_exponential_backoff(
        _call,
        max_attempts=4,
        retry_on=_is_retriable,
        base_sec=3.0,
        max_sec=60.0,
    )

    return result if isinstance(result, list) else []


# ---------------------------------------------------------------------------
# Firestore Writer
# ---------------------------------------------------------------------------

def write_classifications_firestore(
    deputado_id: str,
    notas: List[Dict[str, Any]],
    classifications: List[Dict[str, Any]],
    nome_parlamentar: str = "",
    triade_report: Optional[Dict[str, Any]] = None,
) -> int:
    """Grava classificações em Firestore."""
    from lib.firebase_app import init_firestore
    fs = init_firestore()

    # Merge classificações com notas originais
    classified_notas = []
    alertas_criticos = []

    for cls in classifications:
        idx = cls.get("idx", -1)
        if 0 <= idx < len(notas):
            nota = notas[idx]
            entry = {
                "fornecedor": nota.get("txt_fornecedor", ""),
                "cnpj": nota.get("txt_cnpjcpf", ""),
                "descricao": nota.get("txt_descricao", ""),
                "valor": float(nota.get("vlr_documento", 0) or 0),
                "data": str(nota.get("dat_emissao", "")),
                "url_documento": nota.get("url_documento", ""),
                "ide_documento": nota.get("ide_documento", ""),
                "risco": cls.get("risco", "baixo"),
                "score": cls.get("score", 0),
                "flags": cls.get("flags", []),
                "justificativa": cls.get("justificativa", ""),
                "categoria_suspeita": cls.get("categoria_suspeita"),
            }
            classified_notas.append(entry)

            if cls.get("score", 0) >= 70:
                alertas_criticos.append(entry)

    # Score geral do parlamentar (média ponderada dos scores individuais)
    scores = [c.get("score", 0) for c in classifications if isinstance(c.get("score"), (int, float))]
    score_medio = sum(scores) / len(scores) if scores else 0
    score_max = max(scores) if scores else 0
    notas_alto_risco = sum(1 for s in scores if s >= 70)
    notas_medio_risco = sum(1 for s in scores if 40 <= s < 70)

    # Gravar em transparency_reports
    report_ref = fs.collection("transparency_reports").document(str(deputado_id))
    report_data = {
        "classificacao_ia": {
            "modelo": VERTEX_MODEL,
            "projeto_vertex": vertex_project_id(),
            "gerado_em": datetime.now(timezone.utc).isoformat(),
            "total_notas": len(notas),
            "total_classificadas": len(classified_notas),
            "score_medio": round(score_medio, 1),
            "score_max": score_max,
            "notas_alto_risco": notas_alto_risco,
            "notas_medio_risco": notas_medio_risco,
            "notas_baixo_risco": len(classified_notas) - notas_alto_risco - notas_medio_risco,
            "top_suspeitas": sorted(classified_notas, key=lambda x: x["score"], reverse=True)[:20],
            "disclaimer": LEGAL_DISCLAIMER,
        },
        "score_risco_ia": min(100, int(score_medio * 1.5 + notas_alto_risco * 3)),
        "metadados": {
            "engine": "28_ceap_vertex_classifier",
            "sincronizado_em": datetime.now(timezone.utc).isoformat(),
        },
    }
    if triade_report and isinstance(triade_report, dict):
        report_data["auditoria_asmodeus_triade"] = {
            "modelo": VERTEX_MODEL,
            "gerado_em": datetime.now(timezone.utc).isoformat(),
            "registro": triade_report.get("registro"),
            "avaliacoes": triade_report.get("avaliacoes"),
            "disclaimer": triade_report.get("disclaimer", ""),
        }
    report_ref.set(report_data, merge=True)
    logger.info("Firestore: transparency_reports/%s atualizado (score_ia=%d, %d notas classificadas)",
                deputado_id, report_data["score_risco_ia"], len(classified_notas))

    # Gravar alertas individuais para notas críticas
    if alertas_criticos:
        col = fs.collection("alertas_bodes")
        batch = fs.batch()
        for entry in alertas_criticos[:50]:  # Max 50 alertas por parlamentar
            doc_id = hashlib.sha256(
                f"{deputado_id}|VERTEX_CLASS|{entry['ide_documento']}".encode()
            ).hexdigest()
            batch.set(col.document(doc_id), {
                "politico_id": str(deputado_id),
                "parlamentar_id": str(deputado_id),
                "tipo_risco": "CLASSIFICACAO_IA_CEAP",
                "severidade": "CRITICO" if entry["score"] >= 85 else "ALTO",
                "criticidade": "NIVEL_4" if entry["score"] >= 85 else "NIVEL_3",
                "mensagem": (
                    f"Nota R$ {entry['valor']:,.2f} para {entry['fornecedor'][:50]} "
                    f"classificada como {entry['risco']} (score {entry['score']}): "
                    f"{entry['justificativa']}"
                ),
                "fonte": "engines/28_ceap_vertex_classifier.py",
                "modelo_ia": VERTEX_MODEL,
                "criado_em": datetime.now(timezone.utc),
                "detalhe": {
                    "fornecedor": entry["fornecedor"],
                    "valor": entry["valor"],
                    "flags": entry["flags"],
                    "categoria_suspeita": entry["categoria_suspeita"],
                    "url_documento": entry["url_documento"],
                },
            }, merge=True)
        batch.commit()
        logger.info("Firestore: %d alertas gravados em alertas_bodes", len(alertas_criticos[:50]))

    return len(classified_notas)


# ---------------------------------------------------------------------------
# Main Pipeline
# ---------------------------------------------------------------------------

def process_parlamentar(
    deputado_id: str,
    model_tuple,
    bq_client=None,
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Processa um parlamentar completo: BQ → Gemini → Firestore."""
    start = time.time()

    if bq_client is None:
        bq_client = get_bq_client()

    # 1. Buscar notas do BigQuery
    notas = fetch_notas_bq(deputado_id, bq_client)
    if not notas:
        logger.warning("Nenhuma nota encontrada para deputado %s", deputado_id)
        return {"deputado_id": deputado_id, "status": "sem_dados", "notas": 0}

    nome = notas[0].get("tx_nome_parlamentar", "")
    logger.info("Processando %s (%s) — %d notas", nome, deputado_id, len(notas))

    # 2. Classificar em lotes
    all_classifications = []
    total_batches = (len(notas) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(notas), BATCH_SIZE):
        batch_notas = notas[i:i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1

        try:
            classifications = classify_batch(batch_notas, model_tuple)
            # Ajustar índices para posição global
            for cls in classifications:
                cls["idx"] = cls.get("idx", 0) + i
            all_classifications.extend(classifications)
            logger.info("  Batch %d/%d: %d classificações", batch_num, total_batches, len(classifications))
        except Exception as exc:
            logger.error("  Batch %d/%d FALHOU: %s", batch_num, total_batches, exc)
            continue

        # Rate limiting: ~10 RPM para não estourar quota
        if batch_num < total_batches:
            time.sleep(1.0)

    triade_report: Optional[Dict[str, Any]] = None
    if not dry_run:
        try:
            consolidated = build_consolidated_payload(deputado_id, nome, notas, bq_client)
            if all_classifications:
                scores_ia = [
                    c.get("score", 0)
                    for c in all_classifications
                    if isinstance(c.get("score"), (int, float))
                ]
                consolidated["pos_classificacao_ceap"] = {
                    "notas_classificadas": len(all_classifications),
                    "score_medio": round(sum(scores_ia) / len(scores_ia), 2) if scores_ia else 0,
                    "notas_score_ge_70": sum(1 for s in scores_ia if s >= 70),
                }
            triade_report = audit_asmodeus_triade(consolidated, model_tuple)
        except Exception as exc:
            logger.warning("Auditoria tripartite A.S.M.O.D.E.U.S. ignorada: %s", exc)

    # 3. Gravar resultados
    if dry_run:
        result = {
            "deputado_id": deputado_id,
            "nome": nome,
            "total_notas": len(notas),
            "classificadas": len(all_classifications),
            "alto_risco": sum(1 for c in all_classifications if c.get("score", 0) >= 70),
            "top_5": sorted(all_classifications, key=lambda x: x.get("score", 0), reverse=True)[:5],
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return result

    n_written = write_classifications_firestore(
        deputado_id, notas, all_classifications, nome, triade_report=triade_report
    )

    elapsed = time.time() - start
    result = {
        "deputado_id": deputado_id,
        "nome": nome,
        "status": "ok",
        "total_notas": len(notas),
        "classificadas": len(all_classifications),
        "gravadas_firestore": n_written,
        "alto_risco": sum(1 for c in all_classifications if c.get("score", 0) >= 70),
        "tempo_seg": round(elapsed, 1),
        "asmodeus_triade": bool(triade_report),
    }
    logger.info("CONCLUÍDO %s: %d notas, %d classificadas, %d alto risco em %.1fs",
                nome, len(notas), len(all_classifications),
                result["alto_risco"], elapsed)
    return result


def parse_args(argv=None):
    p = argparse.ArgumentParser(
        description="Engine 28 — Classificador CEAP via Vertex AI (Gemini 2.5)"
    )
    p.add_argument("--deputado-id", default="", help="ID na API Câmara (ex: 204536)")
    p.add_argument("--batch", action="store_true", help="Processar TODOS os parlamentares do BigQuery")
    p.add_argument("--max-concurrent", type=int, default=2, help="Threads paralelas no modo batch")
    p.add_argument("--dry-run", action="store_true", help="Só classificar e imprimir (sem gravar)")
    p.add_argument("--limit", type=int, default=0, help="Limitar número de parlamentares no batch (0=todos)")
    p.add_argument("--output-json", default="", help="Salvar resultado em arquivo JSON")
    return p.parse_args(argv)


def main(argv=None) -> int:
    args = parse_args(argv)

    # Validar configuração
    logger.info("=== Engine 28 — Classificador CEAP via Vertex AI ===")
    logger.info("Vertex AI project: %s", vertex_project_id())
    logger.info("Vertex AI location: %s", vertex_location())
    logger.info("Vertex AI model: %s", VERTEX_MODEL)
    logger.info("BigQuery project: %s", gcp_project_id())
    logger.info("BigQuery table: %s.tbr_ceap.ceap_despesas_ext", gcp_project_id())

    # Inicializar modelo
    try:
        model_tuple = get_vertex_model()
        logger.info("Modelo Vertex AI inicializado com sucesso")
    except Exception as exc:
        logger.error("Falha ao inicializar Vertex AI: %s", exc)
        logger.error("Verifique: pip install google-cloud-aiplatform vertexai")
        logger.error("Verifique: GOOGLE_APPLICATION_CREDENTIALS aponta para SA com aiplatform.user no projeto-codex-br")
        return 1

    # Inicializar BigQuery
    try:
        bq_client = get_bq_client()
        logger.info("BigQuery client inicializado")
    except Exception as exc:
        logger.error("Falha ao inicializar BigQuery: %s", exc)
        return 2

    if args.batch:
        # Modo batch: processar todos
        dep_ids = fetch_all_deputados_bq(bq_client)
        if args.limit > 0:
            dep_ids = dep_ids[:args.limit]
        logger.info("Modo BATCH: %d parlamentares para processar", len(dep_ids))

        results = []
        if args.max_concurrent <= 1:
            for dep_id in dep_ids:
                r = process_parlamentar(dep_id, model_tuple, bq_client, args.dry_run)
                results.append(r)
        else:
            with ThreadPoolExecutor(max_workers=args.max_concurrent) as executor:
                futures = {
                    executor.submit(process_parlamentar, dep_id, model_tuple, None, args.dry_run): dep_id
                    for dep_id in dep_ids
                }
                for future in as_completed(futures):
                    dep_id = futures[future]
                    try:
                        r = future.result()
                        results.append(r)
                    except Exception as exc:
                        logger.error("ERRO deputado %s: %s", dep_id, exc)
                        results.append({"deputado_id": dep_id, "status": "erro", "erro": str(exc)})

        # Resumo
        ok = sum(1 for r in results if r.get("status") == "ok")
        erros = sum(1 for r in results if r.get("status") == "erro")
        total_class = sum(r.get("classificadas", 0) for r in results)
        total_alto = sum(r.get("alto_risco", 0) for r in results)
        logger.info("=== BATCH CONCLUÍDO: %d OK, %d erros, %d notas classificadas, %d alto risco ===",
                    ok, erros, total_class, total_alto)

        if args.output_json:
            Path(args.output_json).write_text(
                json.dumps(results, ensure_ascii=False, indent=2, default=str)
            )

    elif args.deputado_id:
        # Modo individual
        result = process_parlamentar(args.deputado_id, model_tuple, bq_client, args.dry_run)
        if args.output_json:
            Path(args.output_json).write_text(
                json.dumps(result, ensure_ascii=False, indent=2, default=str)
            )
        if result.get("status") == "erro":
            return 3

    else:
        logger.error("Especifique --deputado-id ou --batch")
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
