'use strict';

/** Mapeamento de finalidade → base legal (códigos estáveis para auditoria). */
const BASIS_MAP = {
  revisao_indeferimento_inss: 'art_7_IX_legitimo_interesse',
  marketing: 'art_7_I_consentimento',
  consentimento_landing: 'art_7_I_consentimento',
  peticao_escritorio: 'art_7_VI_execucao_contrato',
  bureau_enriquecimento: 'art_7_IX_legitimo_interesse',
};

function resolveBasis(finalidade) {
  return BASIS_MAP[finalidade] || 'art_7_IX_legitimo_interesse';
}

module.exports = { resolveBasis, BASIS_MAP };
