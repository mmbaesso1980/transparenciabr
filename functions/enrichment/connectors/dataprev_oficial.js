'use strict';

const { AuroraEnricherBase } = require('./_base.js');

class DataprevOficialConnector extends AuroraEnricherBase {
  /**
   * @param {{ cpf: string, finalidade: string, convenio_id?: string }} input
   * @param {object} ctx
   */
  async enrich(input, ctx) {
    this.assertLgpd(ctx);
    if (process.env.DATAPREV_ENABLED !== 'true') {
      const e = new Error(
        'Convênio DATAPREV pendente — solicite via OAB Carpes. Motor AURORA informa: caminho A indisponível até credenciação mTLS.'
      );
      e.statusCode = 503;
      throw e;
    }
    // TODO: implementar mTLS e JWT mútuo quando o convénio for firmado.
    const e = new Error('Caminho A preparado; integração mTLS ainda não ativada.');
    e.statusCode = 501;
    throw e;
  }
}

module.exports = { DataprevOficialConnector };
