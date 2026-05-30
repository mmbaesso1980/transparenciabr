"""
Ocean Ways — Route: /api/v1/search
====================================
Busca de award flights em múltiplas fontes.

Fluxo:
  1. Autenticar Firebase JWT (middleware)
  2. Validar créditos do usuário
  3. Checar cache Firestore (TTL 4h)
  4. CACHE MISS → chamar search-engine/aggregator.py
  5. Gravar resultado no cache
  6. Gravar evento em BigQuery oceanways.searches
  7. Debitar 1 crédito (se não cache hit)
  8. Retornar resultados

TODO (Maestro):
  [ ] Implementar autenticação via firebase_admin (depende de middleware/auth.py)
  [ ] Implementar check de créditos (depende de billing/credits.py)
  [ ] Conectar ao aggregator real (search-engine/aggregator.py)
  [ ] Implementar cache Firestore com TTL 4h
  [ ] Implementar gravação em BigQuery (oceanways.searches + oceanways.results)
  [ ] Implementar rate limiter: 10 req/min por IP; 60/h por UID Pro; 10/h Free
"""

import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class SearchRequest(BaseModel):
    """Payload de busca de award flights.

    Example:
        {
            "origin": "GRU",
            "destination": "LHR",
            "dep_date": "2026-08-15",
            "ret_date": "2026-08-30",
            "cabin": "BUSINESS",
            "programs": ["UATP", "FLYINGBLUE"],
            "max_miles": 100000
        }
    """
    origin: str = Field(..., min_length=3, max_length=3, example="GRU",
                        description="IATA do aeroporto de origem")
    destination: str = Field(..., min_length=3, max_length=3, example="LHR",
                             description="IATA do aeroporto de destino")
    dep_date: date = Field(..., description="Data de partida (YYYY-MM-DD)")
    ret_date: Optional[date] = Field(None, description="Data de retorno; None para oneway")
    cabin: str = Field("ECONOMY", description="ECONOMY | BUSINESS | FIRST")
    programs: Optional[list[str]] = Field(
        None,
        description="Programas de milhas; None = todos os disponíveis",
        example=["UATP", "FLYINGBLUE"]
    )
    max_miles: Optional[int] = Field(None, description="Limite de milhas; None = sem limite")


class AvailabilityResult(BaseModel):
    """Um resultado de disponibilidade de award flight.

    Example:
        {
            "source": "UNITED",
            "program": "UATP",
            "alliance": "STAR",
            "operating_carrier": "UA",
            "flight_number": "UA864",
            "dep_datetime": "2026-08-15T10:30:00Z",
            "arr_datetime": "2026-08-16T05:15:00Z",
            "cabin": "BUSINESS",
            "miles_cost": 57500,
            "taxes_brl": 420.50,
            "seats_available": 2
        }
    """
    result_id: str
    source: str
    program: str
    alliance: Optional[str]
    operating_carrier: Optional[str]
    flight_number: Optional[str]
    dep_datetime: Optional[str]
    arr_datetime: Optional[str]
    cabin: str
    miles_cost: Optional[int]
    taxes_brl: Optional[float]
    taxes_usd: Optional[float]
    seats_available: Optional[int]


class SearchResponse(BaseModel):
    search_id: str
    cache_hit: bool
    credits_charged: int
    results: list[AvailabilityResult]
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/", response_model=SearchResponse, summary="Buscar award flights")
async def search_awards(request: Request, body: SearchRequest):
    """
    Busca disponibilidade de award flights em múltiplas fontes.

    Consome **1 crédito** por busca (0 se cache hit nas últimas 4h).

    Retorna lista de `AvailabilityResult` ordenada por `miles_cost` crescente.

    TODO (Maestro): implementar corpo completo conforme fluxo descrito no módulo.
    """
    # TODO: extrair uid do Firebase JWT (request.state.uid após middleware)
    uid = "TODO_EXTRACT_FROM_JWT"

    # TODO: verificar créditos do usuário via billing.credits.check_credits(uid, 1)
    # Se saldo == 0: raise HTTPException(402, "Saldo de créditos insuficiente")

    search_id = str(uuid.uuid4())

    # TODO: checar cache Firestore
    # cache_key = f"{body.origin}_{body.destination}_{body.dep_date}_{body.cabin}"
    # cached = await firestore_client.get_cache(cache_key)
    # if cached: return SearchResponse(search_id=search_id, cache_hit=True, credits_charged=0, results=cached)

    # TODO: chamar aggregator
    # from search_engine.aggregator import aggregate_search
    # results_raw = await aggregate_search(body)
    results_raw = []  # placeholder

    # TODO: salvar no cache Firestore TTL=4h
    # TODO: gravar em BigQuery oceanways.searches e oceanways.results
    # TODO: debitar 1 crédito via billing.credits.debit(uid, 1, reason="SEARCH", reference_id=search_id)

    return SearchResponse(
        search_id=search_id,
        cache_hit=False,
        credits_charged=1 if results_raw else 0,
        results=results_raw,
        message="TODO: aggregator não implementado — scaffold apenas"
    )


@router.get("/history", summary="Histórico de buscas do usuário")
async def search_history(request: Request, limit: int = 20, offset: int = 0):
    """
    Retorna histórico de buscas do usuário autenticado.

    Dados lidos do BigQuery oceanways.searches WHERE uid = $uid.

    TODO (Maestro):
      [ ] Extrair uid do JWT
      [ ] Consultar BQ com LIMIT/OFFSET
      [ ] Retornar lista paginada
    """
    # TODO: implementar
    return {"history": [], "total": 0, "message": "TODO: não implementado"}
