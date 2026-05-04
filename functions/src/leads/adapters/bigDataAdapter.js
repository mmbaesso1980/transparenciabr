/**
 * @fileoverview Adapter BigDataCorp — consulta de contato por CPF.
 *
 * Comportamento:
 *  - Se BIGDATA_TOKEN estiver configurado: executa consulta real na API BigDataCorp.
 *  - Se não estiver configurado: retorna payload de mock para desenvolvimento/testes.
 *
 * ATENÇÃO: A consulta real consome créditos pagos na conta BigDataCorp.
 * Somente é chamada APÓS a cobrança de créditos do usuário ter sido confirmada.
 *
 * @module adapters/bigDataAdapter
 */

'use strict';

const axios = require('axios');
const { logger } = require('firebase-functions');

/** Endpoint base da API BigDataCorp */
const BIGDATA_BASE_URL = 'https://plataforma.bigdatacorp.com.br';

/** Dataset de contatos utilizado */
const BIGDATA_DATASET = 'people';

/**
 * @typedef {Object} BigDataContactResult
 * @property {string[]} phones         - Telefones encontrados (formato E.164 quando disponível)
 * @property {string[]} emails         - E-mails encontrados
 * @property {Object|null} address     - Endereço principal ou null
 * @property {string} address.logradouro
 * @property {string} address.numero
 * @property {string} address.municipio
 * @property {string} address.uf
 * @property {string} address.cep
 * @property {string|null} reason      - Preenchido apenas em mock ('token_not_configured')
 * @property {boolean} isMock          - true quando token ausente
 */

/**
 * Consulta dados de contato de uma pessoa física pelo CPF.
 *
 * @param {string} cpf - CPF sem pontuação (somente dígitos)
 * @returns {Promise<BigDataContactResult>}
 * @throws {Error} Se a API retornar erro HTTP ou falha de rede
 */
async function fetchContact(cpf) {
  const token = process.env.BIGDATA_TOKEN;

  // ── Modo mock: token não configurado ──────────────────────────────────────
  if (!token) {
    logger.warn('bigDataAdapter.fetchContact: BIGDATA_TOKEN não configurado — retornando mock.', {
      cpf: cpf ? cpf.slice(0, 3) + '***' : null,
    });

    return {
      phones: ['(11) 99999-0000'],
      emails: ['mock@example.com'],
      address: {
        logradouro: 'Rua Exemplo',
        numero: '100',
        municipio: 'São Paulo',
        uf: 'SP',
        cep: '01310-100',
      },
      reason: 'token_not_configured',
      isMock: true,
    };
  }

  // ── Consulta real BigDataCorp ─────────────────────────────────────────────
  logger.info('bigDataAdapter.fetchContact: iniciando consulta real BigDataCorp.', {
    cpf: cpf.slice(0, 3) + '***',
  });

  try {
    const payload = {
      Datasets: 'people_contacts,people_addresses',
      q: `doc{${cpf}}`,
      Limit: 1,
    };

    const response = await axios.post(
      `${BIGDATA_BASE_URL}/${BIGDATA_DATASET}`,
      payload,
      {
        headers: {
          AccessToken: token,
          TokenId: process.env.BIGDATA_TOKEN_ID || '',
          'Content-Type': 'application/json',
        },
        timeout: 15_000, // 15 segundos
      }
    );

    const data = response.data;

    // Extrai resultados do schema BigDataCorp (Result[0])
    const result = Array.isArray(data.Result) && data.Result.length > 0
      ? data.Result[0]
      : {};

    const phones = _extractPhones(result);
    const emails = _extractEmails(result);
    const address = _extractAddress(result);

    logger.info('bigDataAdapter.fetchContact: consulta concluída.', {
      phonesCount: phones.length,
      emailsCount: emails.length,
      hasAddress: !!address,
    });

    return { phones, emails, address, reason: null, isMock: false };
  } catch (err) {
    logger.error('bigDataAdapter.fetchContact: erro na API BigDataCorp.', {
      message: err.message,
      status: err.response?.status,
    });
    throw new Error(`BigDataCorp API falhou: ${err.message}`);
  }
}

// ── Helpers de extração ───────────────────────────────────────────────────────

/**
 * Extrai lista de telefones do payload BigDataCorp.
 * @param {Object} result
 * @returns {string[]}
 */
function _extractPhones(result) {
  const contacts = result.Contacts || result.people_contacts || [];
  if (!Array.isArray(contacts)) return [];
  return contacts
    .filter((c) => c.PhoneNumber || c.phone_number)
    .map((c) => c.PhoneNumber || c.phone_number)
    .slice(0, 5); // Limite razoável
}

/**
 * Extrai lista de e-mails do payload BigDataCorp.
 * @param {Object} result
 * @returns {string[]}
 */
function _extractEmails(result) {
  const contacts = result.Contacts || result.people_contacts || [];
  if (!Array.isArray(contacts)) return [];
  return contacts
    .filter((c) => c.Email || c.email)
    .map((c) => (c.Email || c.email).toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
}

/**
 * Extrai endereço principal do payload BigDataCorp.
 * @param {Object} result
 * @returns {Object|null}
 */
function _extractAddress(result) {
  const addresses = result.Addresses || result.people_addresses || [];
  if (!Array.isArray(addresses) || addresses.length === 0) return null;
  const addr = addresses[0];
  return {
    logradouro: addr.Street || addr.street || '',
    numero: addr.Number || addr.number || 'S/N',
    municipio: addr.Municipality || addr.municipality || '',
    uf: addr.State || addr.state || '',
    cep: (addr.ZipCode || addr.zip_code || '').replace(/\D/g, ''),
  };
}

module.exports = { fetchContact };
