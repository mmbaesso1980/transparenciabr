"""
Rotas /pje — Anti-waste PJe TRF3

Verifica litispendência de processos antes de acionar alertas,
evitando que o advogado receba notificação de processo já em andamento.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

router = APIRouter()


class PjeCheckInput(BaseModel):
    numero_processo: str | None = None
    cpf_hash: str | None = None
    uf: str | None = None


@router.post("/check")
async def check_litispendencia(request: Request, body: PjeCheckInput):
    """
    Verifica litispendência no PJe TRF3.

    Retorna: LIVRE | VERIFICAR | DESCARTAR | ERRO

    Lógica:
    1. Consulta cache BQ (pje_litispendencia_cache) — se hit < 48h, retorna cached
    2. Se cache miss e PJE_TOKEN disponível → consulta TRF3 API
    3. Grava resultado no cache
    4. Retorna status + detalhes

    Sem crédito adicional — incluído no Paywall 2.

    Exemplo de resposta esperada:
    {
      "status": "LIVRE",
      "numero_processo": null,
      "tribunal": null,
      "consultado_em": "2026-05-30T18:00:00Z",
      "expira_em": "2026-06-01T18:00:00Z",
      "fonte": "cache"
    }

    ou se litispendência detectada:
    {
      "status": "DESCARTAR",
      "numero_processo": "5001234-12.2025.4.03.6183",
      "tribunal": "TRF3",
      "consultado_em": "2026-05-30T18:00:00Z",
      "expira_em": "2026-06-01T18:00:00Z",
      "fonte": "pje_api"
    }

    TODO(maestro): implementar via backend/src/services/pje_checker.py
    Token PJe: Secret Manager projects/{project}/secrets/PJE_TOKEN/versions/latest
    Fallback: env PJE_TOKEN (para single-account deployments)
    Referência: frontend/src/data/leadsPrevidenciario.js (litispendencia_status logic)
    """
    return JSONResponse(
        {
            "error": "TODO(maestro): implementar verificação PJe com cache BQ",
            "status": "DESCONHECIDO",
        },
        status_code=501,
    )
