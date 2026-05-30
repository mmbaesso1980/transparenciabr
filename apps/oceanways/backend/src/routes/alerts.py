"""
Ocean Ways — Route: /api/v1/alerts
=====================================
CRUD de alertas de disponibilidade de award flights.

Configurar um alerta é GRÁTIS.
Cada disparo (hit encontrado) consome 2 créditos.
Se saldo < 2, o alerta é suspenso automaticamente (active=FALSE).

Alertas ativos:
  - Free: máximo 2 alertas simultâneos
  - Pro: ilimitados

TODO (Maestro):
  [ ] Implementar POST / (criar alerta)
  [ ] Implementar GET / (listar alertas do usuário)
  [ ] Implementar DELETE /{alert_id} (desativar alerta)
  [ ] Verificar limite de alertas por plano antes de criar
  [ ] alert-checker (Cloud Run Job) lê oceanways.alerts — não precisa de rota própria
"""

import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class AlertCreate(BaseModel):
    """Payload para criar um alerta.

    Example:
        {
            "origin": "GRU",
            "destination": "LHR",
            "dep_date_from": "2026-08-01",
            "dep_date_to": "2026-08-31",
            "cabin": "BUSINESS",
            "programs": ["UATP", "FLYINGBLUE"],
            "max_miles": 80000
        }
    """
    origin: str
    destination: str
    dep_date_from: date
    dep_date_to: date
    cabin: str
    programs: Optional[list[str]] = None
    max_miles: Optional[int] = None


class AlertResponse(BaseModel):
    """Alerta criado/listado.

    Example:
        {
            "alert_id": "uuid",
            "origin": "GRU",
            "destination": "LHR",
            "dep_date_from": "2026-08-01",
            "dep_date_to": "2026-08-31",
            "cabin": "BUSINESS",
            "active": true,
            "hits_count": 0,
            "created_at": "2026-06-15T14:00:00Z"
        }
    """
    alert_id: str
    origin: str
    destination: str
    dep_date_from: date
    dep_date_to: date
    cabin: str
    programs: Optional[list[str]]
    max_miles: Optional[int]
    active: bool
    hits_count: int
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/", response_model=AlertResponse, summary="Criar alerta de disponibilidade")
async def create_alert(request: Request, body: AlertCreate):
    """
    Cria um alerta de disponibilidade de award flight.

    Configura o alerta no BigQuery oceanways.alerts.
    O alert-checker (Cloud Run Job) irá processar periodicamente.

    Limites:
      - Free: 2 alertas simultâneos
      - Pro: ilimitados

    TODO (Maestro):
      [ ] Verificar limite de alertas do plano
      [ ] Inserir em BigQuery oceanways.alerts
      [ ] Também criar doc em Firestore users/{uid}/alerts/{alert_id} para acesso rápido
    """
    alert_id = str(uuid.uuid4())
    # TODO: implementar
    return AlertResponse(
        alert_id=alert_id,
        origin=body.origin,
        destination=body.destination,
        dep_date_from=body.dep_date_from,
        dep_date_to=body.dep_date_to,
        cabin=body.cabin,
        programs=body.programs,
        max_miles=body.max_miles,
        active=True,
        hits_count=0,
        created_at="TODO",
    )


@router.get("/", summary="Listar alertas ativos do usuário")
async def list_alerts(request: Request):
    """
    Lista todos os alertas do usuário autenticado.

    Lê de Firestore users/{uid}/alerts (cache quente).

    TODO (Maestro): implementar
    """
    return {"alerts": [], "message": "TODO: não implementado"}


@router.delete("/{alert_id}", summary="Desativar alerta")
async def delete_alert(request: Request, alert_id: str):
    """
    Desativa um alerta (soft delete: active=FALSE).

    Atualiza BigQuery oceanways.alerts SET active=FALSE, deactivated_at=NOW()
    E remove doc de Firestore users/{uid}/alerts/{alert_id}.

    TODO (Maestro): implementar; verificar que o alert_id pertence ao uid autenticado
    """
    return {"message": "TODO: não implementado", "alert_id": alert_id}
