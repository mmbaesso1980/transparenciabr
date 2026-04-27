#!/usr/bin/env python3
"""
Engine 26 — Dossiê factual de parlamentar (CEAP × PNCP × CADIRREG × alertas).

Gera um dossiê **estritamente factual** sobre um parlamentar a partir dos
dados já consolidados no BigQuery e no Firestore. Não atribui rótulos
ideológicos. Não usa adjetivos políticos. O sumário em linguagem natural
(opcional, via Vertex AI) recebe um prompt-guard que proíbe rotulagem.

Saída:
    * arquivo JSON em ``./out/dossie_<politico_id>.json`` (ou ``--output``).
    * upload opcional em ``radar_dossiers`` no Firestore (escrita admin).

Exemplo:

    python engines/26_ceap_dossier.py \\
        --politico-id 220639 \\
        --output ./out/dossie_220639.json

    python engines/26_ceap_dossier.py \\
        --politico-id 220639 \\
        --include-llm-summary

Variáveis relevantes:
    GCP_PROJECT_ID / BQ_DATASET — origem dos dados (já padrão do repo).
    VERTEX_LOCATION / VERTEX_MODEL — quando ``--include-llm-summary``.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from lib.project_config import bq_dataset_id, gcp_project_id

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | engine=26_dossier | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S%z",
)
logger = logging.getLogger("transparenciabr.engine26")


# ---------------------------------------------------------------------------
# Model.
# ---------------------------------------------------------------------------

@dataclass
class DossierBlock:
    title: str
    metric: Optional[float]
    rows: List[Dict[str, Any]] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)


@dataclass
class FactualDossier:
    politico_id: str
    nome: Optional[str]
    partido: Optional[str]
    uf: Optional[str]
    janela_inicio: str
    janela_fim: str
    gerado_em: str
    blocos: Dict[str, DossierBlock] = field(default_factory=dict)
    sumario_neutro: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        out = asdict(self)
        out["blocos"] = {k: asdict(v) for k, v in self.blocos.items()}
        return out


# ---------------------------------------------------------------------------
# BigQuery helpers (lazy import).
# ---------------------------------------------------------------------------

def _bq_client() -> Any:
    from google.cloud import bigquery  # type: ignore

    return bigquery.Client(project=gcp_project_id())


def _query_rows(sql: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    from google.cloud import bigquery  # type: ignore

    client = _bq_client()
    job_config = None
    if params:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter(k, _bq_type_for(v), v)
                for k, v in params.items()
            ],
        )
    logger.info("bq.query chars=%s params=%s", len(sql), list((params or {}).keys()))
    job = client.query(sql, job_config=job_config)
    return [dict(row.items()) for row in job.result()]


def _bq_type_for(value: Any) -> str:
    if isinstance(value, bool):
        return "BOOL"
    if isinstance(value, int):
        return "INT64"
    if isinstance(value, float):
        return "FLOAT64"
    return "STRING"


# ---------------------------------------------------------------------------
# Coletores factuais — cada um devolve um DossierBlock.
# ---------------------------------------------------------------------------

def _block_perfil(politico_id: str) -> DossierBlock:
    """Lê o perfil base de ``politicos/{politico_id}`` no Firestore."""
    block = DossierBlock(title="Perfil base", metric=None)
    try:
        from lib.firebase_app import init_firestore

        fs = init_firestore()
        snap = fs.collection("politicos").document(politico_id).get()
        if not snap.exists:
            block.notes.append("Documento politicos/{id} ausente no Firestore.")
            return block
        data = snap.to_dict() or {}
        block.rows = [{
            "nome": data.get("nome") or data.get("nome_civil") or data.get("nome_eleitoral"),
            "partido": data.get("partido") or data.get("sigla_partido"),
            "uf": data.get("uf") or data.get("sigla_uf"),
            "cargo": data.get("cargo") or data.get("descricao_cargo"),
            "ativo": bool(data.get("ativo", True)),
        }]
    except Exception as exc:  # noqa: BLE001
        block.notes.append(f"Falha ao ler perfil: {exc.__class__.__name__}: {exc}")
    return block


def _block_ceap_totais(politico_id: str, ini: str, fim: str) -> DossierBlock:
    """Soma factual das despesas CEAP no período."""
    block = DossierBlock(title="CEAP — totais por categoria", metric=None)
    sql = f"""
    SELECT
      tipo_despesa,
      COUNT(*) AS qtd_documentos,
      SUM(valor_documento) AS valor_total,
      AVG(valor_documento) AS ticket_medio
    FROM `{gcp_project_id()}.{bq_dataset_id()}.ceap_despesas`
    WHERE parlamentar_id = @pid
      AND data_emissao BETWEEN DATE(@ini) AND DATE(@fim)
    GROUP BY tipo_despesa
    ORDER BY valor_total DESC
    LIMIT 100
    """
    try:
        rows = _query_rows(sql, {"pid": politico_id, "ini": ini, "fim": fim})
        block.rows = rows
        block.metric = float(sum((r.get("valor_total") or 0.0) for r in rows))
    except Exception as exc:  # noqa: BLE001
        block.notes.append(f"Falha BigQuery (ceap_despesas): {exc}")
    return block


def _block_ceap_top_fornecedores(politico_id: str, ini: str, fim: str) -> DossierBlock:
    block = DossierBlock(title="CEAP — top fornecedores", metric=None)
    sql = f"""
    SELECT
      cnpj_fornecedor,
      ANY_VALUE(nome_fornecedor) AS nome_fornecedor,
      COUNT(*) AS qtd_documentos,
      SUM(valor_documento) AS valor_total
    FROM `{gcp_project_id()}.{bq_dataset_id()}.ceap_despesas`
    WHERE parlamentar_id = @pid
      AND data_emissao BETWEEN DATE(@ini) AND DATE(@fim)
      AND cnpj_fornecedor IS NOT NULL
    GROUP BY cnpj_fornecedor
    ORDER BY valor_total DESC
    LIMIT 25
    """
    try:
        block.rows = _query_rows(sql, {"pid": politico_id, "ini": ini, "fim": fim})
    except Exception as exc:  # noqa: BLE001
        block.notes.append(f"Falha BigQuery (top fornecedores): {exc}")
    return block


def _block_pncp_overlap(politico_id: str) -> DossierBlock:
    """Contratos PNCP em municípios atrelados ao parlamentar."""
    block = DossierBlock(title="PNCP — contratos correlacionados", metric=None)
    sql = f"""
    SELECT
      codigo_ibge_municipio,
      ANY_VALUE(nome_municipio_contexto) AS nome_municipio,
      COUNT(*) AS qtd_contratos,
      SUM(valor_total) AS valor_total
    FROM `{gcp_project_id()}.{bq_dataset_id()}.contratos_pncp`
    WHERE politico_id = @pid
    GROUP BY codigo_ibge_municipio
    ORDER BY valor_total DESC
    LIMIT 25
    """
    try:
        rows = _query_rows(sql, {"pid": politico_id})
        block.rows = rows
        block.metric = float(sum((r.get("valor_total") or 0.0) for r in rows))
    except Exception as exc:  # noqa: BLE001
        block.notes.append(f"Falha BigQuery (contratos_pncp): {exc}")
    return block


def _block_alertas_firestore(politico_id: str) -> DossierBlock:
    block = DossierBlock(title="Alertas factuais (alertas_bodes)", metric=None)
    try:
        from lib.firebase_app import init_firestore

        fs = init_firestore()
        col = fs.collection("alertas_bodes").where("politico_id", "==", politico_id).limit(100)
        rows: List[Dict[str, Any]] = []
        for doc in col.stream():
            d = doc.to_dict() or {}
            rows.append({
                "id": doc.id,
                "tipo_risco": d.get("tipo_risco"),
                "severidade": d.get("severidade"),
                "fonte": d.get("fonte"),
                "criado_em": str(d.get("criado_em") or ""),
                "mensagem": (d.get("mensagem") or "")[:512],
            })
        block.rows = rows
        block.metric = float(len(rows))
    except Exception as exc:  # noqa: BLE001
        block.notes.append(f"Falha Firestore (alertas_bodes): {exc}")
    return block


def _block_anomalias_zscore(politico_id: str, ini: str, fim: str) -> DossierBlock:
    """Z-score de despesas vs. mediana da Câmara, por tipo_despesa.

    Cálculo factual: sem rótulo, sem juízo, só números.
    """
    block = DossierBlock(title="Z-score por tipo de despesa", metric=None)
    sql = f"""
    WITH all_dep AS (
      SELECT parlamentar_id, tipo_despesa, SUM(valor_documento) AS total
      FROM `{gcp_project_id()}.{bq_dataset_id()}.ceap_despesas`
      WHERE data_emissao BETWEEN DATE(@ini) AND DATE(@fim)
      GROUP BY parlamentar_id, tipo_despesa
    ),
    stats AS (
      SELECT tipo_despesa, AVG(total) AS media, STDDEV_SAMP(total) AS desvio
      FROM all_dep
      GROUP BY tipo_despesa
    )
    SELECT
      a.tipo_despesa,
      a.total,
      s.media,
      s.desvio,
      SAFE_DIVIDE(a.total - s.media, s.desvio) AS zscore
    FROM all_dep a
    JOIN stats s USING (tipo_despesa)
    WHERE a.parlamentar_id = @pid
    ORDER BY ABS(IFNULL(SAFE_DIVIDE(a.total - s.media, s.desvio), 0)) DESC
    LIMIT 25
    """
    try:
        block.rows = _query_rows(sql, {"pid": politico_id, "ini": ini, "fim": fim})
    except Exception as exc:  # noqa: BLE001
        block.notes.append(f"Falha BigQuery (zscore): {exc}")
    return block


# ---------------------------------------------------------------------------
# Sumário neutro opcional (Vertex AI).
# ---------------------------------------------------------------------------

def _build_neutral_summary(dossier: FactualDossier) -> Optional[str]:
    """Chama Vertex AI com prompt-guard. Falha silenciosa = retorna None."""
    try:
        from lib.vertex_agent import summarize_neutral
    except Exception as exc:  # noqa: BLE001
        logger.warning("vertex_agent indisponível: %s", exc)
        return None

    context_chunks: List[str] = [
        f"politico_id={dossier.politico_id} nome={dossier.nome or '(sem dado)'} "
        f"partido={dossier.partido or '(sem dado)'} uf={dossier.uf or '(sem dado)'}",
        f"janela: {dossier.janela_inicio} → {dossier.janela_fim}",
    ]
    for key, block in dossier.blocos.items():
        chunk = json.dumps(
            {
                "bloco": key,
                "titulo": block.title,
                "metric": block.metric,
                "rows": block.rows[:25],
                "notes": block.notes,
            },
            ensure_ascii=False,
            default=str,
        )
        context_chunks.append(f"[{key}] {chunk}")
    context = "\n".join(context_chunks)

    instruction = (
        "Produza, em até 12 bullets, um resumo factual do dossiê. "
        "Cada bullet deve citar a fonte entre colchetes (ex.: [ceap_totais], "
        "[pncp_overlap]). Não atribua rótulos ideológicos, não use adjetivos "
        "de juízo. Se um número for relevante, escreva-o explicitamente."
    )
    try:
        return summarize_neutral(context=context, instruction=instruction)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Vertex summary falhou (degradação OK): %s", exc)
        return None


# ---------------------------------------------------------------------------
# Orquestração.
# ---------------------------------------------------------------------------

def build_dossier(
    *,
    politico_id: str,
    janela_inicio: str,
    janela_fim: str,
    include_llm_summary: bool,
) -> FactualDossier:
    perfil_block = _block_perfil(politico_id)
    perfil_row = perfil_block.rows[0] if perfil_block.rows else {}

    dossier = FactualDossier(
        politico_id=politico_id,
        nome=perfil_row.get("nome"),
        partido=perfil_row.get("partido"),
        uf=perfil_row.get("uf"),
        janela_inicio=janela_inicio,
        janela_fim=janela_fim,
        gerado_em=datetime.now(timezone.utc).isoformat(),
    )
    dossier.blocos["perfil"] = perfil_block
    dossier.blocos["ceap_totais"] = _block_ceap_totais(politico_id, janela_inicio, janela_fim)
    dossier.blocos["ceap_fornecedores"] = _block_ceap_top_fornecedores(politico_id, janela_inicio, janela_fim)
    dossier.blocos["ceap_zscore"] = _block_anomalias_zscore(politico_id, janela_inicio, janela_fim)
    dossier.blocos["pncp_overlap"] = _block_pncp_overlap(politico_id)
    dossier.blocos["alertas"] = _block_alertas_firestore(politico_id)

    if include_llm_summary:
        dossier.sumario_neutro = _build_neutral_summary(dossier)

    return dossier


def write_output(dossier: FactualDossier, output: str) -> None:
    payload = dossier.to_dict()
    if output.startswith("gs://"):
        from google.cloud import storage  # type: ignore

        without = output[len("gs://"):]
        bucket, _, name = without.partition("/")
        if not bucket or not name:
            raise ValueError(f"URI GCS inválida: {output}")
        client = storage.Client()
        client.bucket(bucket).blob(name).upload_from_string(
            json.dumps(payload, ensure_ascii=False, default=str, indent=2),
            content_type="application/json",
        )
        logger.info("Dossiê salvo em %s", output)
        return
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, default=str, indent=2), encoding="utf-8")
    logger.info("Dossiê salvo em %s", path)


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------

def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Engine 26 — Dossiê factual de parlamentar (sem rotulagem ideológica).",
    )
    p.add_argument("--politico-id", required=True)
    p.add_argument("--janela-inicio", default="2023-01-01", help="YYYY-MM-DD")
    p.add_argument("--janela-fim", default=datetime.now().date().isoformat(), help="YYYY-MM-DD")
    p.add_argument("--output", default=None, help="Caminho local ou gs://. Default: ./out/dossie_<id>.json")
    p.add_argument("--include-llm-summary", action="store_true",
                   help="Adiciona sumário em linguagem natural via Vertex AI (com prompt-guard).")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    politico_id = args.politico_id.strip()
    if not politico_id:
        logger.error("--politico-id obrigatório.")
        return 2

    output = args.output or f"./out/dossie_{politico_id}.json"
    try:
        dossier = build_dossier(
            politico_id=politico_id,
            janela_inicio=args.janela_inicio,
            janela_fim=args.janela_fim,
            include_llm_summary=args.include_llm_summary,
        )
        write_output(dossier, output)
        logger.info(
            "OK politico_id=%s blocos=%s output=%s llm=%s",
            politico_id,
            list(dossier.blocos.keys()),
            output,
            bool(dossier.sumario_neutro),
        )
        return 0
    except Exception:
        logger.exception("Falha ao gerar dossiê.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
