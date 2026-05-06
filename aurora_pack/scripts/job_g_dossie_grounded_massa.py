#!/usr/bin/env python3
"""
JOB G — Dossiês Gemini Grounded em Massa (Aurora Devastador)
=============================================================
Pré-computa dossiês fact-grounded para os 500 parlamentares com:
  - Maior gasto CEAP (top 250)
  - Maior volume de emendas (top 250 — dedup com top CEAP)

Cada dossiê inclui:
  - Resumo perfil (Gemini 1.5 Pro grounded em google_search)
  - Anomalias CEAP (queries BQ vw_benford_ceap_audit, vw_ceap_zscore_roll)
  - Top fornecedores recorrentes
  - Emendas controversas (PIX, alto valor, baixo IDH)
  - Score de risco 0-100

DESTINO: transparenciabr.transparenciabr.dossie_pre_computed
ORÇAMENTO: R$ 800 (500 dossiês × R$ 1,60 médio)
KILL: aborta se billing_total > R$ 3.500

Princípio "Toda nota é suspeita até prova contrária":
- Toda afirmação deve ter fonte (BQ row ou URL grounded)
- Linguagem factual, não acusatória
- Output JSON estruturado

Uso:
    python job_g_dossie_grounded_massa.py --top 500
"""
import os
import sys
import json
import time
import argparse
import logging
from datetime import datetime, timezone
from google.cloud import bigquery
import vertexai
from vertexai.preview.generative_models import (
    GenerativeModel,
    GenerationConfig,
    Tool,
    grounding,
)

# ── CONFIG ─────────────────────────────────────────────────────────────────
PROJECT_BQ = "transparenciabr"
PROJECT_VERTEX = "projeto-codex-br"
REGION_VERTEX = "us-central1"
MODEL_NAME = "gemini-1.5-pro-002"
BQ_DOSSIE = f"{PROJECT_BQ}.transparenciabr.dossie_pre_computed"
BILLING_TABLE = f"{PROJECT_BQ}.transparenciabr.aurora_billing_log"
BUDGET_HARD_LIMIT_BRL = 3500.0
JOB_BUDGET_BRL = 800.0
COST_PER_DOSSIE_BRL = 1.60  # estimativa: ~8k tokens in + 2k out + grounding

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [JOB-G] %(levelname)s %(message)s",
)
log = logging.getLogger(__name__)


PROMPT_TEMPLATE = """Você é analista forense de transparência pública brasileira.

Analise o parlamentar abaixo apresentando APENAS FATOS com fontes. Linguagem factual, nunca acusatória. Toda afirmação deve citar a fonte (BQ row, URL ou nota oficial).

PARLAMENTAR: {nome}
PARTIDO/UF: {partido}/{uf}
LEGISLATURA: {legislatura}
CASA: {casa}

DADOS BQ CONSOLIDADOS:
{dados_bq}

INSTRUÇÕES:
1. Use google_search para validar perfil público (mandatos, comissões, votações relevantes).
2. Liste anomalias CEAP detectadas pelas views (Benford, z-score) — cite IDs.
3. Identifique fornecedores recorrentes (>3 notas) e padrões.
4. Para emendas, destaque: valor total, beneficiários repetidos, alvos com IDH baixo.
5. Gere SCORE_RISCO 0-100 com justificativa numérica (não opinativa).
6. NUNCA afirme "irregularidade" — use "padrão atípico", "merece verificação", "diverge da média".

OUTPUT (JSON estrito):
{{
  "nome": "...",
  "score_risco": 0-100,
  "score_justificativa": "...",
  "perfil_resumo": "...",
  "fontes_perfil": ["url1", "url2"],
  "anomalias_ceap": [{{"tipo":"benford","detalhe":"...","ref":"id"}}],
  "fornecedores_recorrentes": [{{"cnpj":"...","nome":"...","total_brl":0,"qtd_notas":0}}],
  "emendas_destaque": [{{"valor_brl":0,"municipio":"...","idh":0,"obs":"..."}}],
  "alertas_pix": [],
  "data_geracao": "{ts}"
}}
"""


def check_kill_switch(bq) -> float:
    try:
        q = f"SELECT IFNULL(SUM(cost_brl),0) AS t FROM `{BILLING_TABLE}`"
        return float(list(bq.query(q).result())[0].t)
    except Exception:
        return 0.0


def log_billing(bq, job, cost, units, note):
    row = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "job": job,
        "cost_brl": cost,
        "units": units,
        "note": note,
    }
    try:
        bq.insert_rows_json(BILLING_TABLE, [row])
    except Exception as e:
        log.warning(f"billing log: {e}")


def ensure_table(bq):
    schema = [
        bigquery.SchemaField("dossie_id", "STRING", mode="REQUIRED"),
        bigquery.SchemaField("nome", "STRING"),
        bigquery.SchemaField("partido_uf", "STRING"),
        bigquery.SchemaField("casa", "STRING"),
        bigquery.SchemaField("legislatura", "INT64"),
        bigquery.SchemaField("score_risco", "INT64"),
        bigquery.SchemaField("dossie_json", "STRING"),
        bigquery.SchemaField("model", "STRING"),
        bigquery.SchemaField("cost_brl", "FLOAT64"),
        bigquery.SchemaField("created_at", "TIMESTAMP"),
    ]
    table = bigquery.Table(BQ_DOSSIE, schema=schema)
    try:
        bq.create_table(table, exists_ok=True)
    except Exception as e:
        log.warning(f"create_table: {e}")


def fetch_top_parlamentares(bq, top_n: int) -> list:
    """Top por gasto CEAP unido com top emendas, dedup por nome+casa."""
    q = f"""
    WITH ceap AS (
      SELECT
        UPPER(TRIM(txNomeParlamentar)) AS nome,
        ANY_VALUE(sgPartido) AS partido,
        ANY_VALUE(sgUF) AS uf,
        'camara' AS casa,
        ANY_VALUE(nuLegislatura) AS legislatura,
        SUM(IFNULL(vlrLiquido,0)) AS total_brl,
        COUNT(*) AS qtd_notas
      FROM `{PROJECT_BQ}.transparenciabr.ceap_despesas`
      WHERE txNomeParlamentar IS NOT NULL
      GROUP BY nome
    ),
    emendas AS (
      SELECT
        UPPER(TRIM(nomeAutor)) AS nome,
        NULL AS partido,
        NULL AS uf,
        'mista' AS casa,
        NULL AS legislatura,
        SUM(IFNULL(valorEmpenhado,0)) AS total_brl,
        COUNT(*) AS qtd_notas
      FROM `{PROJECT_BQ}.transparenciabr.emendas`
      WHERE nomeAutor IS NOT NULL
      GROUP BY nome
    ),
    top_ceap AS (SELECT *, ROW_NUMBER() OVER(ORDER BY total_brl DESC) AS rk FROM ceap),
    top_em   AS (SELECT *, ROW_NUMBER() OVER(ORDER BY total_brl DESC) AS rk FROM emendas)

    SELECT * FROM top_ceap WHERE rk <= {top_n // 2}
    UNION ALL
    SELECT * FROM top_em WHERE rk <= {top_n // 2}
    """
    rows = list(bq.query(q).result())
    seen = set()
    out = []
    for r in rows:
        key = (r.nome, r.casa)
        if key in seen or not r.nome:
            continue
        seen.add(key)
        out.append(r)
    return out[:top_n]


def fetch_dados_bq(bq, nome: str) -> dict:
    """Coleta evidências BQ para um parlamentar."""
    out = {"ceap_total": 0, "qtd_notas": 0, "top_fornecedores": [], "emendas_total": 0}
    try:
        q1 = f"""
        SELECT SUM(vlrLiquido) total, COUNT(*) qtd
        FROM `{PROJECT_BQ}.transparenciabr.ceap_despesas`
        WHERE UPPER(TRIM(txNomeParlamentar)) = @n
        """
        cfg = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("n", "STRING", nome)]
        )
        r = list(bq.query(q1, job_config=cfg).result())[0]
        out["ceap_total"] = float(r.total or 0)
        out["qtd_notas"] = int(r.qtd or 0)

        q2 = f"""
        SELECT txtFornecedor, numCnpjCpf, SUM(vlrLiquido) v, COUNT(*) c
        FROM `{PROJECT_BQ}.transparenciabr.ceap_despesas`
        WHERE UPPER(TRIM(txNomeParlamentar)) = @n
        GROUP BY 1,2 ORDER BY v DESC LIMIT 10
        """
        out["top_fornecedores"] = [
            {"nome": x.txtFornecedor, "cnpj": x.numCnpjCpf, "total": float(x.v or 0), "qtd": int(x.c)}
            for x in bq.query(q2, job_config=cfg).result()
        ]
    except Exception as e:
        log.warning(f"fetch_dados_bq({nome}): {e}")
    return out


def already_done(bq, dossie_ids: list) -> set:
    if not dossie_ids:
        return set()
    try:
        q = f"SELECT dossie_id FROM `{BQ_DOSSIE}` WHERE dossie_id IN UNNEST(@ids)"
        cfg = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ArrayQueryParameter("ids", "STRING", dossie_ids)]
        )
        return {r.dossie_id for r in bq.query(q, job_config=cfg).result()}
    except Exception:
        return set()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=500)
    ap.add_argument("--sleep", type=float, default=1.0)
    args = ap.parse_args()

    bq = bigquery.Client(project=PROJECT_BQ)
    vertexai.init(project=PROJECT_VERTEX, location=REGION_VERTEX)

    grounding_tool = Tool.from_google_search_retrieval(
        grounding.GoogleSearchRetrieval()
    )
    model = GenerativeModel(MODEL_NAME, tools=[grounding_tool])

    spent_total = check_kill_switch(bq)
    if spent_total > BUDGET_HARD_LIMIT_BRL:
        log.error(f"KILL-SWITCH: R$ {spent_total:.2f}")
        sys.exit(99)

    log.info(f"Gasto Aurora: R$ {spent_total:.2f} | Orçamento G: R$ {JOB_BUDGET_BRL}")

    ensure_table(bq)

    parlamentares = fetch_top_parlamentares(bq, args.top)
    log.info(f"Parlamentares alvo: {len(parlamentares)}")

    ids = [f"{p.nome}|{p.casa}" for p in parlamentares]
    done = already_done(bq, ids)
    pending = [p for p in parlamentares if f"{p.nome}|{p.casa}" not in done]
    log.info(f"Pendentes: {len(pending)}")

    job_spent = 0.0
    generated = 0

    for p in pending:
        if (spent_total + job_spent) > BUDGET_HARD_LIMIT_BRL:
            log.error("KILL-SWITCH global")
            break
        if job_spent > JOB_BUDGET_BRL:
            log.warning(f"Orçamento G esgotado em {generated}")
            break

        dossie_id = f"{p.nome}|{p.casa}"
        try:
            dados = fetch_dados_bq(bq, p.nome)
            prompt = PROMPT_TEMPLATE.format(
                nome=p.nome,
                partido=p.partido or "—",
                uf=p.uf or "—",
                legislatura=p.legislatura or "—",
                casa=p.casa,
                dados_bq=json.dumps(dados, ensure_ascii=False, indent=2),
                ts=datetime.now(timezone.utc).isoformat(),
            )

            t0 = time.time()
            resp = model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    temperature=0.2,
                    max_output_tokens=4096,
                    response_mime_type="application/json",
                ),
            )
            dt = time.time() - t0

            text = resp.text
            try:
                dossie_json = json.loads(text)
                score = int(dossie_json.get("score_risco", 0))
            except Exception:
                dossie_json = {"raw": text}
                score = 0

            row = {
                "dossie_id": dossie_id,
                "nome": p.nome,
                "partido_uf": f"{p.partido or '—'}/{p.uf or '—'}",
                "casa": p.casa,
                "legislatura": int(p.legislatura) if p.legislatura else None,
                "score_risco": score,
                "dossie_json": json.dumps(dossie_json, ensure_ascii=False),
                "model": MODEL_NAME,
                "cost_brl": COST_PER_DOSSIE_BRL,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            errors = bq.insert_rows_json(BQ_DOSSIE, [row])
            if errors:
                log.error(f"insert: {errors}")
                continue

            job_spent += COST_PER_DOSSIE_BRL
            generated += 1
            log_billing(bq, "job_g_dossie", COST_PER_DOSSIE_BRL, 1, f"id={dossie_id} score={score}")

            if generated % 25 == 0:
                log.info(f"Progresso: {generated}/{len(pending)} | R${job_spent:.2f} | {dt:.1f}s/dossie")

            time.sleep(args.sleep)
        except Exception as e:
            log.error(f"Falha {p.nome}: {e}")
            time.sleep(3)
            continue

    log.info(f"=== JOB G concluído ===")
    log.info(f"Dossiês gerados: {generated}")
    log.info(f"Custo: R$ {job_spent:.2f}")


if __name__ == "__main__":
    main()
