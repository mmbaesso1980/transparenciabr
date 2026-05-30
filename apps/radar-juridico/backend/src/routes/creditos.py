"""
Rotas /creditos — Gestão de créditos do Radar Jurídico

Leitura do saldo e histórico de consumo.
DÉBITO é feito internamente pelas outras rotas (não exposto ao cliente diretamente).
"""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/saldo")
async def get_saldo(request: Request):
    """
    Retorna saldo atual de créditos do usuário autenticado.

    Leitura: Firestore usuarios/{uid}.creditos
    (campo compartilhado com o resto do TransparênciaBR)

    Exemplo de resposta:
    {
      "creditos": 245,
      "creditos_ilimitados": false,
      "tier": "premium",
      "consumo_hoje": 55,
      "limite_diario_freemium": 300
    }

    TODO(maestro): implementar leitura via Admin SDK Firestore.
    Reutilizar lógica de functions/src/leads/utils/firestoreCredits.js (portado para Python).
    """
    return JSONResponse(
        {"error": "TODO(maestro): implementar leitura de saldo do Firestore"},
        status_code=501,
    )


@router.get("/historico")
async def get_historico(request: Request):
    """
    Retorna histórico de consumo de créditos nos últimos 30 dias.
    Agrupado por ação (leads_consulta, alerta_criacao, export_csv).

    TODO(maestro): implementar query BQ em radar_juridico.alertas_log
    + radar_juridico.lgpd_audit_radar agrupado por uid + data.
    """
    return JSONResponse(
        {"error": "TODO(maestro): implementar histórico de créditos"},
        status_code=501,
    )
