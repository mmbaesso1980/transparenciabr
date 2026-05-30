"""
Ocean Ways — Source: AwardWallet
===================================
Conector para AwardWallet API.

STATUS: PLACEHOLDER — NÃO IMPLEMENTADO

NOTA: AwardWallet foca em rastreamento de saldos de programas de fidelidade,
não em busca de disponibilidade de voos award.

RELEVÂNCIA PARA OCEAN WAYS:
  - R1: Baixa — não é buscador de award availability diretamente
  - R2: Média — integração para exibir saldo do programa do usuário
        ("você tem 85.000 Smiles — suficiente para essa rota em business")

AÇÃO NECESSÁRIA ANTES DE IMPLEMENTAR:
  1. Verificar programa de desenvolvedores: https://awardwallet.com/api
  2. Avaliar se oferece endpoint de award availability ou apenas saldos
  3. Verificar TOS para uso em aplicação terceira

TODO (Maestro para R2):
  [ ] Registrar conta developer AwardWallet
  [ ] Implementar OAuth flow para usuário conectar seus programas
  [ ] Implementar GET de saldos por programa
  [ ] Mostrar saldo no dashboard do usuário com indicação de suficiência para rotas
"""

import structlog
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from aggregator import SearchRequest, AvailabilityResult

log = structlog.get_logger()

SOURCE_NAME = "AWARDWALLET"


class AwardWalletSource:
    """Conector para AwardWallet.

    NOTA: Provavelmente mais útil para feature de saldo de milhas (R2)
    do que para busca de disponibilidade (R1).

    TODO (Maestro): avaliar escopo real da API antes de implementar.
    """

    async def search(self, request: "SearchRequest") -> list["AvailabilityResult"]:
        """
        TODO (Maestro): avaliar se AwardWallet tem endpoint de award availability.
        Se não tiver, este source não entra no aggregator de busca.
        Mover para um módulo de "saldo de milhas" separado.
        """
        log.warning("awardwallet_source_not_implemented", source=SOURCE_NAME)
        raise NotImplementedError(f"Source {SOURCE_NAME} — verificar escopo da API primeiro")
