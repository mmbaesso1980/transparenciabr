"""
Ocean Ways — Source: Direct Airlines APIs
==========================================
Conectores para APIs oficiais das companhias aéreas.

STATUS: SCAFFOLD — APIs identificadas, implementação pendente.

Companhias cobertas em R1:
  - United MileagePlus (developer.united.com — Offers API)
  - Air France / KLM Flying Blue (developer.airfranceklm.com)

Companhias para R2:
  - Amadeus GDS (developers.amadeus.com — fallback universal)
  - British Airways Avios (requer credencial comercial IATA)
  - LATAM Pass

CRITÉRIO DE OURO: usar APENAS APIs oficiais documentadas.
Nenhum parsing de HTML de sites de companhias.

TODO (Maestro):
  [ ] Registrar chave de API em developer.united.com
  [ ] Registrar chave de API em developer.airfranceklm.com
  [ ] Gravar API keys no Secret Manager (projeto-codex-br)
  [ ] Implementar UnitedSource.search()
  [ ] Implementar AirFranceSource.search()
  [ ] Escrever testes com fixtures de response mockado (pytest-httpx)
"""

import uuid
import httpx
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aggregator import SearchRequest, AvailabilityResult

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# United MileagePlus
# ---------------------------------------------------------------------------

class UnitedSource:
    """Conector para United Airlines MileagePlus Offers API.

    API: developer.united.com
    Aliança: Star Alliance
    Programa: UATP (United MileagePlus)

    Autenticação: API Key no header X-API-Key ou OAuth2 (verificar docs)
    Rate limit: verificar na documentação da API

    TODO (Maestro):
      [ ] Registrar conta e obter API key em developer.united.com
      [ ] Documentar base URL, endpoints e payload da Award Search
      [ ] Implementar search() abaixo
    """

    SOURCE_NAME = "UNITED"
    PROGRAM = "UATP"
    ALLIANCE = "STAR"
    BASE_URL = "TODO: https://api.united.com"  # Verificar URL real

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def search(self, request: "SearchRequest") -> list["AvailabilityResult"]:
        """
        Busca disponibilidade award no United MileagePlus.

        Args:
            request: SearchRequest com parâmetros da busca

        Returns:
            Lista de AvailabilityResult normalizados

        TODO (Maestro):
          [ ] Construir payload conforme docs United Offers API
          [ ] Adicionar API key do Secret Manager
          [ ] Parsear response e chamar _normalize() por cada resultado
          [ ] Filtrar por cabin, programs, max_miles
        """
        log.warning("united_source_not_implemented")
        raise NotImplementedError(
            "UnitedSource: registrar API key em developer.united.com e implementar"
        )

    def _normalize(self, raw: dict) -> "AvailabilityResult":
        """
        Converte response United para AvailabilityResult.

        TODO (Maestro): mapear campos após verificar estrutura real da API United.
        Campos esperados (hipotéticos — verificar docs):
            raw["flightNumber"]
            raw["departureDateTime"]
            raw["milesRequired"]
            raw["seatsAvailable"]
        """
        from aggregator import AvailabilityResult
        # TODO: implementar mapeamento real
        raise NotImplementedError("TODO: mapear campos United API")


# ---------------------------------------------------------------------------
# Air France / KLM Flying Blue
# ---------------------------------------------------------------------------

class AirFranceSource:
    """Conector para Air France / KLM Flying Blue API.

    API: developer.airfranceklm.com
    Aliança: SkyTeam
    Programa: FLYINGBLUE (Air France / KLM)

    Autenticação: OAuth2 Client Credentials (verificar docs)
    Rate limit: verificar na documentação da API

    TODO (Maestro):
      [ ] Registrar conta em developer.airfranceklm.com
      [ ] Implementar OAuth2 token acquisition
      [ ] Documentar Award Search endpoint e payload
      [ ] Implementar search() abaixo
    """

    SOURCE_NAME = "AIRFRANCE"
    PROGRAM = "FLYINGBLUE"
    ALLIANCE = "SKYTEAM"
    BASE_URL = "TODO: https://api.airfranceklm.com"  # Verificar URL real

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def search(self, request: "SearchRequest") -> list["AvailabilityResult"]:
        """
        Busca disponibilidade award Flying Blue.

        TODO (Maestro): implementar após registrar na API AF/KLM
        """
        log.warning("airfrance_source_not_implemented")
        raise NotImplementedError(
            "AirFranceSource: registrar em developer.airfranceklm.com e implementar"
        )

    def _normalize(self, raw: dict) -> "AvailabilityResult":
        """
        TODO (Maestro): mapear campos após verificar estrutura real da API AF/KLM.
        """
        raise NotImplementedError("TODO: mapear campos AF/KLM API")


# ---------------------------------------------------------------------------
# Amadeus GDS (fallback universal)
# ---------------------------------------------------------------------------

class AmadeusSource:
    """Conector para Amadeus for Developers (GDS fallback).

    API: developers.amadeus.com
    Cobertura: multi-aliança (fallback quando sources diretos falham)

    Autenticação: OAuth2 Client Credentials (self-service)
    Rate limit: freemium tem limite; produção cobrada por chamada

    TODO (Maestro):
      [ ] Registrar conta em developers.amadeus.com (self-service)
      [ ] Obter Client ID e Client Secret
      [ ] Verificar endpoint de Award Flight availability (Shopping APIs)
      [ ] Gravar credenciais no Secret Manager
      [ ] Implementar search() abaixo
    """

    SOURCE_NAME = "AMADEUS"
    PROGRAM = "MULTI"  # Depende do resultado
    ALLIANCE = None    # Multi-aliança
    AUTH_URL = "https://test.api.amadeus.com/v1/security/oauth2/token"
    BASE_URL = "https://test.api.amadeus.com"  # Staging

    async def _get_token(self) -> str:
        """
        Obtém token OAuth2 do Amadeus.

        TODO (Maestro): implementar com client_id e client_secret do Secret Manager
        """
        raise NotImplementedError("TODO: OAuth2 Amadeus")

    async def search(self, request: "SearchRequest") -> list["AvailabilityResult"]:
        """
        TODO (Maestro): implementar após verificar endpoint de Award availability no Amadeus.
        Nota: Amadeus tem Flight Offers Search mas verificar se cobre award (milhas).
        """
        log.warning("amadeus_source_not_implemented")
        raise NotImplementedError("AmadeusSource: verificar endpoint award e implementar")


# ---------------------------------------------------------------------------
# Facade: DirectAirlinesSource
# Agrupa todos os sources diretos para simplificar importação no aggregator
# ---------------------------------------------------------------------------

class DirectAirlinesSource:
    """Facade que agrupa todos os conectores diretos de companhias.

    O aggregator instancia esta classe que internamente dispara
    UnitedSource, AirFranceSource e AmadeusSource em paralelo.

    TODO (Maestro): implementar search() com asyncio.gather interno
    """

    async def search(self, request: "SearchRequest") -> list["AvailabilityResult"]:
        """
        Dispara busca em todas as companhias diretas em paralelo.

        TODO (Maestro):
          [ ] asyncio.gather(United, AirFrance, Amadeus) com timeout individual
          [ ] Filtrar por request.programs se definido
          [ ] Retornar lista concatenada e normalizada
        """
        log.warning("direct_airlines_facade_not_implemented")
        return []  # TODO: implementar
