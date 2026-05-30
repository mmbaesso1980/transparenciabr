"""
Ocean Ways — Source: seek.travel
==================================
Conector para o agregador seek.travel.

STATUS: PLACEHOLDER — NÃO IMPLEMENTADO

AÇÃO NECESSÁRIA ANTES DE IMPLEMENTAR:
  1. Verificar TOS de seek.travel (https://seek.travel/terms)
  2. Verificar se existe programa de afiliados/parceiros com API
  3. Contatar equipe seek.travel para autorização de acesso programático
  4. Somente implementar o conector após autorização por escrito

RISCO TOS: Indeterminado — NÃO usar scraping sem autorização.

TODO (Maestro após autorização):
  [ ] Documentar URL da API oficial e chave de autenticação
  [ ] Implementar SeekSource.search() com chamadas HTTP autenticadas
  [ ] Mapear campos do response para AvailabilityResult (normalização)
  [ ] Implementar rate limiting conforme TOS (X calls/min)
  [ ] Adicionar retry com backoff exponencial (tenacity)
  [ ] Escrever testes com fixtures de response mockado
"""

import structlog
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aggregator import SearchRequest, AvailabilityResult

log = structlog.get_logger()

SOURCE_NAME = "SEEK"
SEEK_API_BASE_URL = "TODO: https://api.seek.travel/v1"  # Placeholder


class SeekSource:
    """Conector para seek.travel.

    Instanciado pelo aggregator para cada busca.

    TODO (Maestro): implementar após autorização TOS.
    """

    async def search(self, request: "SearchRequest") -> list["AvailabilityResult"]:
        """
        Busca disponibilidade award no seek.travel.

        Args:
            request: SearchRequest com parâmetros da busca

        Returns:
            Lista de AvailabilityResult normalizados

        Raises:
            NotImplementedError: source ainda não implementado
            httpx.HTTPStatusError: erro na API do seek.travel
            asyncio.TimeoutError: timeout — tratado pelo aggregator

        TODO (Maestro):
          [ ] Construir payload da requisição seek.travel (verificar docs da API)
          [ ] POST/GET para SEEK_API_BASE_URL/search com auth header
          [ ] Parsear response JSON
          [ ] Chamar _normalize() para converter para AvailabilityResult
          [ ] Filtrar por request.max_miles se definido
        """
        log.warning("seek_source_not_implemented", source=SOURCE_NAME)
        raise NotImplementedError(
            f"Source {SOURCE_NAME} não implementado. "
            "Verificar TOS e obter autorização antes de implementar."
        )

    def _normalize(self, raw: dict, request: "SearchRequest") -> "AvailabilityResult":
        """
        Converte o payload bruto do seek.travel para AvailabilityResult.

        Args:
            raw: dict com um resultado bruto da API seek
            request: SearchRequest original

        Returns:
            AvailabilityResult normalizado

        TODO (Maestro): mapear campos após verificar estrutura real da API.
        Example de mapeamento hipotético:
            miles_cost = raw.get("points") or raw.get("miles")
            taxes_usd  = raw.get("fees", {}).get("usd")
        """
        raise NotImplementedError("TODO: mapear campos após verificar API seek.travel")
