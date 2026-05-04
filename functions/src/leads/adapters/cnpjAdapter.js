/**
 * @fileoverview Adapter CNPJ — consulta dados públicos de pessoa jurídica via BrasilAPI.
 *
 * Utiliza endpoint gratuito da BrasilAPI (sem necessidade de token):
 * https://brasilapi.com.br/api/cnpj/v1/{cnpj}
 *
 * Dados retornados são públicos da Receita Federal e utilizados para
 * preencher automaticamente os campos do advogado na petição inicial.
 *
 * @module adapters/cnpjAdapter
 */

'use strict';

const axios = require('axios');
const { logger } = require('firebase-functions');

/** Endpoint BrasilAPI CNPJ */
const BRASIL_API_CNPJ_URL = 'https://brasilapi.com.br/api/cnpj/v1';

/**
 * @typedef {Object} CnpjPublicData
 * @property {string} razao_social    - Razão social cadastrada na Receita Federal
 * @property {string} nome_fantasia   - Nome fantasia (pode ser vazio)
 * @property {string} endereco        - Endereço formatado (logradouro, número, município/UF)
 * @property {string} telefone_publico - Telefone público (pode ser vazio)
 * @property {string} email           - E-mail público (pode ser vazio)
 * @property {string} municipio       - Município
 * @property {string} uf              - UF
 * @property {string} cep             - CEP sem pontuação
 * @property {string} situacao_cadastral - Ex: 'ATIVA'
 */

/**
 * Busca dados públicos de CNPJ via BrasilAPI (Receita Federal).
 *
 * @param {string} cnpj - CNPJ com ou sem pontuação
 * @returns {Promise<CnpjPublicData>}
 * @throws {Error} Se CNPJ inválido, não encontrado ou API indisponível
 */
async function fetchPublic(cnpj) {
  // Normaliza CNPJ: apenas dígitos
  const cnpjLimpo = cnpj.replace(/\D/g, '');

  if (cnpjLimpo.length !== 14) {
    throw new Error(`CNPJ inválido: ${cnpj}`);
  }

  logger.info('cnpjAdapter.fetchPublic: consultando BrasilAPI.', {
    cnpj: cnpjLimpo.slice(0, 8) + '***',
  });

  try {
    const response = await axios.get(`${BRASIL_API_CNPJ_URL}/${cnpjLimpo}`, {
      timeout: 10_000,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TransparenciaBR/1.0 (plataforma@transparenciabr.org)',
      },
    });

    const d = response.data;

    // Monta endereço formatado
    const enderecoParts = [
      d.logradouro || '',
      d.numero ? `, ${d.numero}` : '',
      d.complemento ? ` (${d.complemento})` : '',
      d.bairro ? ` — ${d.bairro}` : '',
      d.municipio ? ` — ${d.municipio}` : '',
      d.uf ? `/${d.uf}` : '',
      d.cep ? ` — CEP ${_formatCep(d.cep)}` : '',
    ]
      .join('')
      .trim();

    const result = {
      razao_social: d.razao_social || '',
      nome_fantasia: d.nome_fantasia || '',
      endereco: enderecoParts,
      telefone_publico: _formatTelefone(d.ddd_telefone_1, d.telefone_1),
      email: (d.email || '').toLowerCase(),
      municipio: d.municipio || '',
      uf: d.uf || '',
      cep: (d.cep || '').replace(/\D/g, ''),
      situacao_cadastral: d.descricao_situacao_cadastral || '',
    };

    logger.info('cnpjAdapter.fetchPublic: dados obtidos com sucesso.', {
      razao_social: result.razao_social,
      situacao: result.situacao_cadastral,
    });

    return result;
  } catch (err) {
    if (err.response?.status === 404) {
      logger.warn('cnpjAdapter.fetchPublic: CNPJ não encontrado na Receita Federal.', {
        cnpj: cnpjLimpo.slice(0, 8) + '***',
      });
      throw new Error(`CNPJ ${cnpjLimpo} não encontrado na Receita Federal`);
    }

    logger.error('cnpjAdapter.fetchPublic: erro ao consultar BrasilAPI.', {
      message: err.message,
      status: err.response?.status,
    });
    throw new Error(`Falha ao consultar CNPJ: ${err.message}`);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Formata CEP no padrão XXXXX-XXX.
 * @param {string} cep
 * @returns {string}
 */
function _formatCep(cep) {
  const c = (cep || '').replace(/\D/g, '');
  if (c.length === 8) return `${c.slice(0, 5)}-${c.slice(5)}`;
  return cep;
}

/**
 * Formata telefone com DDD.
 * @param {string} ddd
 * @param {string} telefone
 * @returns {string}
 */
function _formatTelefone(ddd, telefone) {
  if (!ddd && !telefone) return '';
  const num = (telefone || '').replace(/\D/g, '');
  const d = (ddd || '').replace(/\D/g, '');
  if (!num) return '';
  return d ? `(${d}) ${num}` : num;
}

module.exports = { fetchPublic };
