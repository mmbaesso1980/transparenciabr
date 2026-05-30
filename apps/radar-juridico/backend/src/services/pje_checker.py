"""
PJe Checker — Anti-waste litispendência TRF3

Verifica se um processo ou CPF já tem ação ativa no PJe TRF3,
evitando que o advogado configure alerta para caso em litispendência.

Token PJe: armazenado no Secret Manager como PJE_TOKEN (global) ou
PJE_TOKEN_{uid} (por advogado) — nunca em claro no Firestore.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("radar.pje_checker")

PJE_TOKEN = os.environ.get("PJE_TOKEN", "")


class PjeStatus:
    LIVRE = "LIVRE"
    VERIFICAR = "VERIFICAR"
    DESCARTAR = "DESCARTAR"
    DESCONHECIDO = "DESCONHECIDO"
    ERRO = "ERRO"


class PjeChecker:
    """
    Verificador de litispendência PJe TRF3.

    Fluxo:
    1. Verifica cache BQ (pje_litispendencia_cache) — TTL 48h
    2. Se cache miss, consulta API PJe TRF3
    3. Grava resultado no cache
    4. Retorna status

    Sem token PJe → retorna DESCONHECIDO (não bloqueia o alerta,
    mas avisa o usuário para verificar manualmente).

    Referência: frontend/src/data/leadsPrevidenciario.js (litispendencia_status logic)
    Referência: aurora_v3_maestro/corpus/08_skill_enrichment_pii.md (Datajud key)
    """

    def __init__(self, bq_service=None, pje_token: str | None = None):
        self.bq = bq_service
        self.token = pje_token or PJE_TOKEN
        self.datajud_key = os.environ.get(
            "DATAJUD_KEY",
            "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
        )

    async def check(
        self,
        numero_processo: str | None = None,
        cpf_hash: str | None = None,
        uf: str | None = None,
    ) -> dict:
        """
        Verifica litispendência.

        Input:
            numero_processo: número CNJ (ex: 5001234-12.2025.4.03.6183)
            cpf_hash: SHA-256 do CPF (para busca por beneficiário)
            uf: UF do processo (para selecionar tribunal)

        Output:
        {
          "status": "LIVRE" | "VERIFICAR" | "DESCARTAR" | "DESCONHECIDO" | "ERRO",
          "numero_processo": "5001234-...",   // se DESCARTAR
          "tribunal": "TRF3",                 // se DESCARTAR
          "consultado_em": "2026-05-30T...",
          "expira_em": "2026-06-01T...",
          "fonte": "cache" | "pje_api" | "datajud",
          "aviso": "Sem token PJe — verifique manualmente"  // se DESCONHECIDO
        }

        TODO(maestro): implementar:
        1. cache_key = numero_processo or f"{cpf_hash}:{uf}"
        2. cached = await self.bq.get_pje_cache(cache_key)
        3. if cached: return cached
        4. if self.token: result = await self._query_pje_api(numero_processo, cpf_hash, uf)
        5. else: result = await self._query_datajud(numero_processo)  # fallback público
        6. await self.bq.set_pje_cache(cache_key, result['status'], ...)
        7. return result

        Referência Datajud (público, sem token advogado):
        - Base URL: https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search
        - Key: self.datajud_key (Bearer)
        - Campo de busca: numeroProcesso
        """
        if not self.token:
            logger.warning("Sem token PJe — retornando DESCONHECIDO")
            return {
                "status": PjeStatus.DESCONHECIDO,
                "aviso": "Token PJe não configurado — verifique manualmente no TRF3",
                "fonte": "sem_token",
            }

        # TODO(maestro): implementar query PJe + fallback Datajud
        raise NotImplementedError("PjeChecker.check — TODO(maestro)")

    async def _query_pje_api(
        self, numero_processo: str | None, cpf_hash: str | None, uf: str | None
    ) -> dict:
        """
        Consulta direta à API PJe do TRF3 com token de advogado.

        IMPORTANTE LGPD: Esta chamada usa o token pessoal do advogado,
        não expõe CPF do beneficiário à API — busca por numero_processo
        ou por NB (Número de Benefício) INSS quando disponível.

        TODO(maestro): implementar usando httpx com retry (tenacity):
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    "https://pje.trf3.jus.br/pje-consulta-api/api/v1/processos",
                    params={"numeroProcesso": numero_processo},
                    headers={"Authorization": f"Bearer {self.token}"}
                )
        """
        raise NotImplementedError("PjeChecker._query_pje_api — TODO(maestro)")

    async def _query_datajud(self, numero_processo: str | None) -> dict:
        """
        Fallback público via API Datajud CNJ (sem autenticação de advogado).
        Menos informações que PJe direto, mas funciona sem token.

        Key: cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==
        Cobertura: TJSP, TRF3, TJPA, TRF1, TJES, TRF2

        TODO(maestro): implementar via httpx POST para:
        https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search
        Body: {"query": {"match": {"numeroProcesso.keyword": numero_processo}}}
        """
        raise NotImplementedError("PjeChecker._query_datajud — TODO(maestro)")
