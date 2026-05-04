/**
 * @fileoverview Ponto de exportação do módulo Leads/Paywall — TransparênciaBR
 *
 * Este arquivo exporta as Cloud Functions deste módulo para integração
 * com o arquivo principal functions/src/index.js do projeto.
 *
 * ── COMO INTEGRAR AO functions/src/index.js ───────────────────────────────
 *
 *   // Módulo Leads / Paywall
 *   const leadsPaywall = require('./leads'); // ou caminho relativo correto
 *   exports.openContactBigData    = leadsPaywall.openContactBigData;
 *   exports.generateInitialPetition = leadsPaywall.generateInitialPetition;
 *
 * ─────────────────────────────────────────────────────────────────────────
 *
 * @module leads/index
 */

'use strict';

const { openContactBigData } = require('./openContactBigData');
const { generateInitialPetition } = require('./generateInitialPetition');

module.exports = {
  openContactBigData,
  generateInitialPetition,
};
