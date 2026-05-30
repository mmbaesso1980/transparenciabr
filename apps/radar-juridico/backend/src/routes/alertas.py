"""
Rotas /alertas — Radar Jurídico INSS (Paywall 2)

Gerencia alertas "publicou-pegamos-alarme": o usuário configura
um monitor para um número de processo ou tipo de benefício,
e o sistema notifica quando há publicação no DOU ou PJe.

Custo: 2 créditos por alerta configurado.
Anti-waste: verifica litispendência PJe antes de notificar.
"""

from __future__ import annotations

from fastapi import APIRouter, Body, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

router = APIRouter()


# ---------------------------------------------------------------------------
# Schema de input para criar alerta
# ---------------------------------------------------------------------------
class AlertaCreateInput(BaseModel):
    tipo_monitor: str = Field(
        ...,
        description="numero_processo | cpf_hash | especie_uf",
        examples=["numero_processo"],
    )
    numero_processo: str | None = Field(
        None,
        description="Número CNJ do processo (ex: 5001234-12.2025.4.03.6183)",
    )
    cpf_hash: str | None = Field(
        None,
        description="SHA-256 do CPF do beneficiário (nunca CPF em claro)",
    )
    especie_codigo: int | None = Field(
        None,
        description="Código de espécie INSS (para tipo_monitor=especie_uf)",
    )
    uf: str | None = Field(None, description="UF (para tipo_monitor=especie_uf)")

    # TODO(maestro): adicionar validação Pydantic:
    #   @model_validator(mode='after')
    #   def validate_tipo_monitor(self):
    #       if self.tipo_monitor == 'numero_processo' and not self.numero_processo:
    #           raise ValueError("numero_processo obrigatório para tipo_monitor=numero_processo")
    #       if self.tipo_monitor == 'cpf_hash' and not self.cpf_hash:
    #           raise ValueError("cpf_hash obrigatório para tipo_monitor=cpf_hash")
    #       ...


# ---------------------------------------------------------------------------
# POST /alertas — criar alerta
# ---------------------------------------------------------------------------
@router.post("/")
async def create_alerta(request: Request, body: AlertaCreateInput):
    """
    Cria um novo alerta "publicou-pegamos".
    Custo: 2 créditos.
    Máximo: 20 alertas ativos por usuário.

    Fluxo:
    1. Verificar auth + saldo >= 2 créditos
    2. Verificar limite de 20 alertas ativos
    3. Debitar 2 créditos
    4. Criar documento em Firestore: radar_juridico_alertas/{uid}/watches/{alerta_id}
    5. Gravar em BQ: alertas_watchlist
    6. Retornar alerta_id + status

    Exemplo de resposta esperada:
    {
      "alerta_id": "uuid-xxx",
      "status": "ATIVO",
      "tipo_monitor": "numero_processo",
      "numero_processo": "5001234-12.2025.4.03.6183",
      "proximo_check": "2026-05-31T06:00:00-03:00",
      "creditos_debitados": 2
    }

    TODO(maestro): implementar fluxo completo.
    Referência: functions/src/leads/utils/firestoreCredits.js (lógica de débito).
    """
    return JSONResponse(
        {
            "error": "TODO(maestro): implementar criação de alerta com débito de créditos",
            "custo_creditos": 2,
            "limite_alertas": 20,
        },
        status_code=501,
    )


# ---------------------------------------------------------------------------
# GET /alertas — listar alertas do usuário
# ---------------------------------------------------------------------------
@router.get("/")
async def list_alertas(
    request: Request,
    status: str = Query(default="", description="Filtrar por status: ATIVO|INATIVO|DESCARTADO"),
    page: int = Query(default=1, ge=1),
):
    """
    Lista alertas configurados pelo usuário autenticado.

    Leitura do Firestore: radar_juridico_alertas/{uid}/watches/
    Inclui histórico dos últimos 3 disparos de cada alerta.

    Exemplo de resposta esperada:
    {
      "alertas": [
        {
          "alerta_id": "uuid-xxx",
          "tipo_monitor": "numero_processo",
          "numero_processo": "5001234-12.2025.4.03.6183",
          "status": "ATIVO",
          "pje_status": "LIVRE",
          "ultimo_check": "2026-05-30T18:00:00-03:00",
          "ultimo_disparo": null,
          "historico": []
        }
      ],
      "total": 3,
      "limite_maximo": 20
    }

    TODO(maestro): implementar leitura do Firestore com paginação.
    """
    return JSONResponse(
        {"error": "TODO(maestro): implementar listagem de alertas do Firestore"},
        status_code=501,
    )


# ---------------------------------------------------------------------------
# DELETE /alertas/{alerta_id} — cancelar alerta
# ---------------------------------------------------------------------------
@router.delete("/{alerta_id}")
async def cancel_alerta(alerta_id: str, request: Request):
    """
    Cancela um alerta (status → INATIVO).
    Créditos NÃO são devolvidos.

    Firestore: update radar_juridico_alertas/{uid}/watches/{alerta_id}
      { status: 'INATIVO', cancelado_em: SERVER_TIMESTAMP }
    BQ: UPDATE alertas_watchlist SET status='INATIVO' WHERE alerta_id=...

    TODO(maestro): implementar com verificação de propriedade (uid == alerta.uid).
    """
    return JSONResponse(
        {"error": "TODO(maestro): implementar cancelamento de alerta"},
        status_code=501,
    )
