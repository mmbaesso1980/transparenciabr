"""
BigQuery Service — Radar Jurídico INSS

Wrapper para todas as queries BigQuery do módulo.
Garante que:
1. Todas as queries vão para southamerica-east1
2. Nenhum dado PII é retornado (CPF sempre mascarado ou ausente)
3. Queries usam parâmetros (nunca string formatting — SQL injection protection)

Padrão do repo: ver engines/26_inss_indeferimentos_bq_load.py e
engines/lib/bigquery_helpers.py para referência.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger("radar.bq_service")

GCP_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "transparenciabr")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "southamerica-east1")
BQ_DATASET = "radar_juridico"

# Tabelas / views principais
TABLE_LEADS_RAW = f"`{GCP_PROJECT}.{BQ_DATASET}.leads_radar_raw`"
TABLE_LEADS_SCORED = f"`{GCP_PROJECT}.{BQ_DATASET}.leads_radar_scored`"
VIEW_LEADS_SAFE = f"`{GCP_PROJECT}.{BQ_DATASET}.vw_leads_scored_safe`"
TABLE_ALERTAS_WATCHLIST = f"`{GCP_PROJECT}.{BQ_DATASET}.alertas_watchlist`"
TABLE_ALERTAS_LOG = f"`{GCP_PROJECT}.{BQ_DATASET}.alertas_log`"
TABLE_PJE_CACHE = f"`{GCP_PROJECT}.{BQ_DATASET}.pje_litispendencia_cache`"
TABLE_LGPD_AUDIT = f"`{GCP_PROJECT}.{BQ_DATASET}.lgpd_audit_radar`"


class BQService:
    """
    Wrapper BigQuery para o Radar Jurídico.

    TODO(maestro): implementar todos os métodos com google-cloud-bigquery:
        from google.cloud import bigquery
        self.client = bigquery.Client(project=GCP_PROJECT, location=BQ_LOCATION)

    IMPORTANTE: sempre usar QueryJobConfig com query_parameters (não string.format).
    Exemplo:
        job_config = bigquery.QueryJobConfig(
            query_parameters=[
                bigquery.ScalarQueryParameter("uf", "STRING", uf),
                bigquery.ScalarQueryParameter("score_min", "FLOAT64", score_min),
            ]
        )
        query = f"SELECT * FROM {VIEW_LEADS_SAFE} WHERE uf = @uf AND score_match_icp >= @score_min"
        result = self.client.query(query, job_config=job_config).result()
    """

    def __init__(self, client=None):
        """
        Args:
            client: instância de bigquery.Client (injetada para testes, ou None para produção)
        """
        # TODO(maestro): inicializar client real se não injetado:
        # from google.cloud import bigquery
        # self.client = client or bigquery.Client(project=GCP_PROJECT, location=BQ_LOCATION)
        self.client = client
        logger.info("BQService inicializado — projeto=%s dataset=%s", GCP_PROJECT, BQ_DATASET)

    async def query_leads(
        self,
        page: int = 1,
        page_size: int = 25,
        uf: str = "",
        especie: int = 0,
        tipo_acao: str = "",
        score_min: float = 0.0,
        foco_atual: bool = False,
    ) -> dict[str, Any]:
        """
        Retorna leads paginados da view vw_leads_scored_safe.

        Input:
            page: página 1-indexed
            page_size: itens por página (max 100)
            uf: filtro UF ("" = todos)
            especie: código espécie INSS (0 = todos)
            tipo_acao: tipo de ação ICP ("" = todos)
            score_min: score mínimo (0.0 = todos)
            foco_atual: se True, filtra apenas leads com foco_atual=True

        Output esperado:
            {
              "leads": [...],  # lista de dicts com campos de vw_leads_scored_safe
              "total": 2850,
              "page": 1,
              "page_size": 25
            }

        TODO(maestro): implementar query paginada com OFFSET LIMIT no BQ.
        Atenção: BQ não tem cursor nativo — usar LIMIT @page_size OFFSET @offset.
        Para datasets > 10M rows, usar clustered queries por uf + especie_codigo.
        """
        # TODO(maestro): implementar
        raise NotImplementedError("BQService.query_leads — TODO(maestro)")

    async def get_lead_by_id(self, lead_id: str) -> dict[str, Any] | None:
        """
        Busca um lead específico por lead_id.

        TODO(maestro): SELECT * FROM vw_leads_scored_safe WHERE lead_id = @lead_id LIMIT 1
        Retorna None se não encontrado.
        """
        raise NotImplementedError("BQService.get_lead_by_id — TODO(maestro)")

    async def get_pje_cache(self, cache_key: str) -> dict[str, Any] | None:
        """
        Verifica cache de litispendência PJe.
        Retorna None se não há cache ou se expirado (expira_em < CURRENT_TIMESTAMP()).

        cache_key: cpf_hash:uf ou numero_processo

        TODO(maestro):
            SELECT * FROM {TABLE_PJE_CACHE}
            WHERE cache_key = @cache_key AND expira_em > CURRENT_TIMESTAMP()
            LIMIT 1
        """
        raise NotImplementedError("BQService.get_pje_cache — TODO(maestro)")

    async def set_pje_cache(
        self, cache_key: str, status: str, numero_processo: str | None, tribunal: str | None
    ) -> None:
        """
        Grava resultado de verificação PJe no cache (TTL 48h).

        TODO(maestro): INSERT INTO {TABLE_PJE_CACHE} com expira_em = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 48 HOUR)
        Usar MERGE para idempotência (atualiza se cache_key já existe).
        """
        raise NotImplementedError("BQService.set_pje_cache — TODO(maestro)")

    async def log_lgpd(
        self, uid: str, cpf_hash: str, connector: str, base_legal: str, acao: str,
        sucesso: bool, trace_id: str, duration_ms: int
    ) -> None:
        """
        Grava log imutável LGPD em lgpd_audit_radar.

        OBRIGATÓRIO antes de qualquer operação que envolva PII (caminhos A/B/C/D).
        CPF NUNCA em claro — apenas hash SHA-256.

        TODO(maestro): INSERT INTO {TABLE_LGPD_AUDIT} (...)
        Usar streaming insert (insert_rows_json) para latência mínima.
        """
        raise NotImplementedError("BQService.log_lgpd — TODO(maestro)")
