/**
 * usePainelData — Single source of truth dos dados do Painel.
 *
 * HOJE (07/05 manhã): retorna mockData.
 * NOITE: trocar cada bloco por hooks reais
 *  ex: const { data: ceap } = useDashboardKPIs();
 *      pulsoCEAP = ceap || mock.pulsoCEAP;
 *
 * Mantém o mesmo contrato de saída para que os componentes não mudem.
 */

import * as mock from '../components/painel/mockData';

export function usePainelData() {
  // TODO 07/05 noite: ligar hooks reais aqui ↓
  // import { useDashboardKPIs } from './useDashboardKPIs';
  // import { useAlvos } from './useAlvos';
  // import { useUniverseRoster } from './useUniverseRoster';

  return {
    loading: false,
    error: null,
    pontuacaoBrasil:    mock.pontuacaoBrasil,
    maioresCotas:       mock.maioresCotas,
    sinalizacoesSOC:    mock.sinalizacoesSOC,
    mapaUF:             mock.mapaUF,
    pulsoCEAP:          mock.pulsoCEAP,
    mataUF:             mock.mataUF,
    emendasCriticas:    mock.emendasCriticas,
    contratosPNCP:      mock.contratosPNCP,
    radarJuridico:      mock.radarJuridico,
    meuUniverso:        mock.meuUniverso,
    maisFrugais:        mock.maisFrugais,
    influenciaSetorial: mock.influenciaSetorial,
    atividadeLegislativa: mock.atividadeLegislativa,
    promessaEntrega:    mock.promessaEntrega,
    pulsoFederal:       mock.pulsoFederal,
    redeEmpresarial:    mock.redeEmpresarial,
    aberturaOrgao:      mock.aberturaOrgao,
    parlamentares:      mock.parlamentares,
    headerInfo:         mock.headerInfo,
  };
}
