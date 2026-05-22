'use strict';

const axios = require('axios');
const { BigQuery } = require('@google-cloud/bigquery');
const { AuroraEnricherBase } = require('./_base.js');
const { hashCpfDigits } = require('../utils/cryptoHash.js');
const { getSecret } = require('../utils/secrets.js');

let _bq;
function getBq() {
  if (!_bq) _bq = new BigQuery();
  return _bq;
}

const BUDGET_DEFAULT = 500;

async function getSpendTodayBrl() {
  const q = `
    SELECT COALESCE(SUM(custo_brl), 0) AS total
    FROM \`transparenciabr.tbr_leads_prev.enrichment_costs\`
    WHERE DATE(timestamp, 'America/Sao_Paulo') = CURRENT_DATE('America/Sao_Paulo')
  `;
  const [rows] = await getBq().query({ query: q, location: 'US' });
  return Number(rows?.[0]?.total ?? 0);
}

async function recordCost({ cpf_hash, produto, custo_brl }) {
  const row = {
    cpf_hash,
    produto,
    custo_brl: Number(custo_brl) || 0,
    timestamp: new Date(),
  };
  await getBq().dataset('tbr_leads_prev').table('enrichment_costs').insert([row]);
}

async function getCache({ cpf_hash, produto }) {
  const q = `
    SELECT response_json
    FROM \`transparenciabr.tbr_leads_prev.enrichment_cache\`
    WHERE cpf_hash = @cpf_hash AND produto = @produto
      AND timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
    ORDER BY timestamp DESC
    LIMIT 1
  `;
  const [rows] = await getBq().query({
    query: q,
    params: { cpf_hash, produto },
    location: 'US',
  });
  if (!rows?.length) return null;
  try {
    return JSON.parse(rows[0].response_json);
  } catch {
    return null;
  }
}

async function putCache({ cpf_hash, produto, response }) {
  const row = {
    cpf_hash,
    produto,
    response_json: JSON.stringify(response),
    timestamp: new Date(),
  };
  await getBq().dataset('tbr_leads_prev').table('enrichment_cache').insert([row]);
}

async function notifyCircuitBreaker(message) {
  const chat = process.env.TELEGRAM_ALERT_CHAT_ID;
  const token = await getSecret('TELEGRAM_BOT_TOKEN');
  if (!chat || !token) return;
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chat,
    text: `Comandante Baesso — motor AURORA: ${message}`,
  });
}

class SerasaQuodConnector extends AuroraEnricherBase {
  async enrich(input, ctx) {
    this.assertLgpd(ctx);
    const cpfDigits = String(input.cpf || '').replace(/\D/g, '');
    const cpf_hash = hashCpfDigits(cpfDigits);
    const produto = input.produto || 'completo';

    const budget = Number(process.env.BUDGET_DIARIO_BRL || BUDGET_DEFAULT);
    const spent = await getSpendTodayBrl().catch(() => 0);
    if (spent >= budget) {
      await notifyCircuitBreaker(
        `Circuito do bureau aberto: gasto diário R$ ${spent.toFixed(2)} atingiu o teto R$ ${budget.toFixed(2)}.`
      );
      const e = new Error('Teto diário do bureau atingido; novas consultas suspensas até a virada do dia.');
      e.statusCode = 429;
      throw e;
    }

    const cached = await getCache({ cpf_hash, produto }).catch(() => null);
    if (cached) return { ...cached, source: cached.source || 'CACHE' };

    const provider = (process.env.BUREAU_PROVIDER || 'serasa').toLowerCase();
    const keyName = provider === 'quod' ? 'BUREAU_API_KEY_QUOD' : 'BUREAU_API_KEY';
    const apiKey = await getSecret(keyName);
    if (!apiKey || apiKey === 'PLACEHOLDER_RECONFIGURE') {
      const e = new Error(
        'Bureau não configurado — defina o segredo adequado no Secret Manager. Motor AURORA não inventa telefones.'
      );
      e.statusCode = 503;
      throw e;
    }

    const baseUrl = process.env.BUREAU_HTTP_BASE_URL;
    if (!baseUrl) {
      const e = new Error(
        'BUREAU_HTTP_BASE_URL ausente — configure o endpoint corporativo acordado com o fornecedor (Serasa/Quod).'
      );
      e.statusCode = 503;
      throw e;
    }

    const url = `${baseUrl.replace(/\/$/, '')}/enrich`;
    const { data } = await axios.post(
      url,
      { cpf: cpfDigits, produto, provider },
      { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 30000 }
    );

    const custo = Number(data?.custo_brl ?? data?.custo ?? 0);
    await recordCost({ cpf_hash, produto, custo_brl: custo }).catch(() => null);

    const out = {
      telefones: data.telefones || [],
      emails: data.emails || [],
      source: provider === 'quod' ? 'QUOD' : 'SERASA',
    };
    await putCache({ cpf_hash, produto, response: out }).catch(() => null);
    return out;
  }
}

module.exports = { SerasaQuodConnector, getSpendTodayBrl, recordCost, getCache, putCache };
