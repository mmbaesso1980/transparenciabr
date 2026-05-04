/**
 * @fileoverview Adapter PJe TRF3 — verifica existência de processo judicial após indeferimento.
 *
 * Comportamento:
 *  - Se PJE_TOKEN estiver configurado: realiza consulta real no PJe TRF3.
 *  - Se não estiver configurado: retorna { hasProcessAfterIndeferimento: null, reason: 'token_not_configured' }.
 *
 * Este adapter implementa o "anti-desperdício": se o CPF já possui processo
 * ativo no PJe, o lead é desqualificado ANTES de qualquer cobrança ao usuário.
 *
 * TODO (Sprint 2): Obter PJE_TOKEN junto ao TRF3 e validar schema real da API.
 *
 * @module adapters/pjeAdapter
 */

'use strict';

const axios = require('axios');
const { logger } = require('firebase-functions');

/**
 * Endpoint base do PJe TRF3.
 * ATENÇÃO: URL sujeita a alteração após entrega do token oficial.
 */
const PJE_BASE_URL = process.env.PJE_BASE_URL || 'https://pje.trf3.jus.br/pje/api/v1';

/**
 * @typedef {Object} PjeCheckResult
 * @property {boolean|null} hasProcessAfterIndeferimento
 *   - true: CPF tem processo aberto (lead desqualificado)
 *   - false: nenhum processo encontrado (lead válido)
 *   - null: token não configurado ou verificação indisponível
 * @property {string|null} reason   - Motivo quando null (ex: 'token_not_configured')
 * @property {string|null} numeroProcesso - Número do processo se encontrado
 * @property {boolean} isMock
 */

/**
 * Verifica se um CPF possui processo ativo no PJe TRF3 relacionado
 * a benefício previdenciário indeferido pelo INSS.
 *
 * @param {string} cpf - CPF sem pontuação (somente dígitos)
 * @param {Object} [options={}]
 * @param {string} [options.dataIndeferimento] - Data do indeferimento (YYYY-MM-DD)
 *   Quando fornecida, filtra processos APÓS essa data (mais preciso).
 * @returns {Promise<PjeCheckResult>}
 */
async function checkProcessExists(cpf, options = {}) {
  const token = process.env.PJE_TOKEN;

  // ── Modo stub: token ainda não entregue ──────────────────────────────────
  if (!token) {
    logger.warn('pjeAdapter.checkProcessExists: PJE_TOKEN não configurado — retornando stub.', {
      cpf: cpf ? cpf.slice(0, 3) + '***' : null,
    });

    return {
      hasProcessAfterIndeferimento: null,
      reason: 'token_not_configured',
      numeroProcesso: null,
      isMock: true,
    };
  }

  // ── Consulta real PJe TRF3 ───────────────────────────────────────────────
  logger.info('pjeAdapter.checkProcessExists: iniciando consulta real PJe TRF3.', {
    cpf: cpf.slice(0, 3) + '***',
  });

  try {
    /**
     * Parâmetros de consulta conforme schema estimado da API PJe REST.
     * TODO: ajustar campos após validação com documentação oficial TRF3.
     */
    const params = {
      cpf_parte: cpf,
      classe_judicial: '1132', // Classe: Benefícios Previdenciários (CNJ)
      orgao_julgador_codigo: 'TRF3',
    };

    if (options.dataIndeferimento) {
      params.data_ajuizamento_inicio = options.dataIndeferimento;
    }

    const response = await axios.get(`${PJE_BASE_URL}/processos`, {
      params,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      timeout: 20_000,
    });

    const processos = response.data?.content || response.data?.processos || [];
    const hasProcess = Array.isArray(processos) && processos.length > 0;
    const numeroProcesso = hasProcess ? processos[0].numero || processos[0].numeroProcesso : null;

    logger.info('pjeAdapter.checkProcessExists: consulta concluída.', {
      hasProcess,
      numeroProcesso,
    });

    return {
      hasProcessAfterIndeferimento: hasProcess,
      reason: null,
      numeroProcesso,
      isMock: false,
    };
  } catch (err) {
    // Falha de rede ou API: retorna null para não bloquear o fluxo indevidamente.
    // O chamador decide se trata como erro fatal ou segue sem a verificação.
    logger.error('pjeAdapter.checkProcessExists: erro na consulta PJe.', {
      message: err.message,
      status: err.response?.status,
    });

    // Distingue 404 (CPF não encontrado = sem processo) de outros erros
    if (err.response?.status === 404) {
      return {
        hasProcessAfterIndeferimento: false,
        reason: null,
        numeroProcesso: null,
        isMock: false,
      };
    }

    throw new Error(`PJe TRF3 API falhou: ${err.message}`);
  }
}

module.exports = { checkProcessExists };
