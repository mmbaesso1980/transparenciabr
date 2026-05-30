"""
Ocean Ways — Search Engine Aggregator
=======================================
Módulo central de busca multi-source de award flights.

Recebe um SearchRequest e retorna lista normalizada de AvailabilityResult
agregada de múltiplas fontes (sources/).

Arquitetura:
  - Coroutines async disparadas em paralelo (asyncio.gather)
  - Timeout por source (padrão: 10s)
  - Fallback: se source falhar, logar erro e continuar com demais
  - Resultado normalizado para schema unificado (AvailabilityResult)
  - Ordenação final: miles_cost crescente, depois taxes_brl crescente

Uso (pelo backend):
    from search_engine.aggregator import aggregate_search
    results = await aggregate_search(search_request)

TODO (Maestro):
  [ ] Implementar aggregate_search() com asyncio.gather
  [ ] Implementar normalização de resultados por source
  [ ] Implementar timeout e circuit breaker por source (tenacity)
  [ ] Adicionar métricas de latência por source (structlog)
  [ ] Implementar deduplicação (mesmo voo pode aparecer em múltiplas fontes)
  [ ] Suporte a oneways e roundtrips (separate outbound+return ou combinado)
"""

import asyncio
import structlog
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sources.seek import SeekSource
from sources.direct_airlines import DirectAirlinesSource
# from sources.awardwallet import AwardWalletSource  # TODO: habilitar quando pronto
# from sources.point_me import PointMeSource          # TODO: habilitar quando pronto

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Configuração de sources ativos
# ---------------------------------------------------------------------------

ACTIVE_SOURCES = [
    DirectAirlinesSource,
    SeekSource,
    # AwardWalletSource,
    # PointMeSource,
]

# Timeout por source (segundos). Sources lentos são descartados.
SOURCE_TIMEOUT_SECONDS = 10


# ---------------------------------------------------------------------------
# Schema unificado de resultado
# ---------------------------------------------------------------------------

@dataclass
class AvailabilityResult:
    """Disponibilidade normalizada de award flight.

    Todos os sources retornam neste formato após normalização.

    Attributes:
        result_id: UUID v4 gerado pelo aggregator
        source: identificador do source (ex: "UNITED", "AIRFRANCE", "SEEK")
        program: código do programa de milhas (ex: "UATP", "FLYINGBLUE")
        alliance: aliança (STAR | SKYTEAM | ONEWORLD | None)
        operating_carrier: IATA da cia operadora
        flight_number: ex "UA864"
        dep_datetime: decolagem em UTC (ISO 8601)
        arr_datetime: chegada em UTC (ISO 8601)
        cabin: ECONOMY | BUSINESS | FIRST
        miles_cost: custo em milhas/pontos (int)
        taxes_brl: taxas em BRL (float | None)
        taxes_usd: taxas em USD (float | None)
        seats_available: assentos disponíveis (int | None — nem todo source informa)
        raw_payload: payload bruto original para debug/auditoria
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
    raw_payload: dict = field(default_factory=dict)


@dataclass
class SearchRequest:
    """Parâmetros de busca normalizados.

    Recebido pelo backend e passado ao aggregator.

    Example:
        SearchRequest(
            origin="GRU",
            destination="LHR",
            dep_date=date(2026, 8, 15),
            cabin="BUSINESS",
            programs=["UATP", "FLYINGBLUE"]
        )
    """
    origin: str         # IATA 3 letras
    destination: str    # IATA 3 letras
    dep_date: date
    ret_date: Optional[date] = None
    cabin: str = "ECONOMY"
    programs: Optional[list[str]] = None  # None = todos
    max_miles: Optional[int] = None


# ---------------------------------------------------------------------------
# Aggregator principal
# ---------------------------------------------------------------------------

async def aggregate_search(request: SearchRequest) -> list[AvailabilityResult]:
    """
    Busca award flights em múltiplas fontes em paralelo.

    Retorna lista de AvailabilityResult ordenada por miles_cost crescente.
    Sources que falharem são logados e ignorados (graceful degradation).

    Args:
        request: SearchRequest com parâmetros da busca

    Returns:
        Lista de AvailabilityResult (pode ser vazia se nenhum source retornar)

    Example:
        req = SearchRequest(origin="GRU", destination="LHR",
                            dep_date=date(2026, 8, 15), cabin="BUSINESS")
        results = await aggregate_search(req)
        # results = [AvailabilityResult(source="UNITED", miles_cost=57500, ...), ...]

    TODO (Maestro):
      [ ] Substituir a lista de TODO_tasks pela implementação real abaixo
    """
    log.info("aggregator_starting",
             origin=request.origin,
             destination=request.destination,
             dep_date=str(request.dep_date),
             cabin=request.cabin,
             sources=[s.__name__ for s in ACTIVE_SOURCES])

    # TODO: implementar tasks com asyncio.gather e timeout
    # tasks = [
    #     asyncio.wait_for(source().search(request), timeout=SOURCE_TIMEOUT_SECONDS)
    #     for source in ACTIVE_SOURCES
    # ]
    # results_per_source = await asyncio.gather(*tasks, return_exceptions=True)
    #
    # all_results = []
    # for source_cls, res in zip(ACTIVE_SOURCES, results_per_source):
    #     if isinstance(res, Exception):
    #         log.warning("source_failed", source=source_cls.__name__, error=str(res))
    #         continue
    #     all_results.extend(res)
    #
    # # Deduplicate por (operating_carrier, flight_number, dep_datetime, cabin)
    # all_results = _deduplicate(all_results)
    #
    # # Sort by miles_cost asc, taxes_brl asc
    # all_results.sort(key=lambda r: (r.miles_cost or 999_999, r.taxes_brl or 0))
    #
    # log.info("aggregator_done", total_results=len(all_results))
    # return all_results

    log.warning("aggregator_not_implemented")
    return []  # TODO: remover quando implementado


def _deduplicate(results: list[AvailabilityResult]) -> list[AvailabilityResult]:
    """
    Remove duplicatas quando o mesmo voo aparece em múltiplos sources.

    Critério de unicidade: (operating_carrier, flight_number, dep_datetime, cabin)
    Quando duplicado, mantém o resultado com menor miles_cost.

    TODO (Maestro): implementar
    """
    # TODO: implementar com dict keyed por tuple de unicidade
    return results
