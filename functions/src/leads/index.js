/**
 * @fileoverview Ponto de exportação do módulo Leads/Paywall — TransparênciaBR
 *
 * Getters lazy: cada callable só carrega o seu ficheiro quando o export é lido,
 * evitando puxar Vertex/DOCX/BigQuery de `generateInitialPetition` no parse de `openContactBigData`.
 *
 * @module leads/index
 */

'use strict';

module.exports = {
  get openContactBigData() {
    return require('./openContactBigData').openContactBigData;
  },
  get generateInitialPetition() {
    return require('./generateInitialPetition').generateInitialPetition;
  },
};
