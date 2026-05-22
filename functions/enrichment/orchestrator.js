'use strict';

const { DataprevOficialConnector } = require('./connectors/dataprev_oficial.js');
const { SerasaQuodConnector } = require('./connectors/serasa_quod.js');
const { PeticaoTemplateConnector } = require('./connectors/peticao_template.js');

const TIMEOUT_MS = 30000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout(promise, ms) {
  let t;
  const to = new Promise((_, rej) => {
    t = setTimeout(() => rej(Object.assign(new Error('timeout'), { statusCode: 504 })), ms);
  });
  try {
    return await Promise.race([promise, to]);
  } finally {
    clearTimeout(t);
  }
}

async function withRetry(fn, { retries = 1, baseMs = 400 } = {}) {
  try {
    return await fn();
  } catch (e) {
    if (retries <= 0) throw e;
    await sleep(baseMs);
    return await fn();
  }
}

/**
 * Motor AURORA — orquestrador de enriquecimento multi-fonte (caminhos A/B/C/D).
 */
class AuroraEnricher {
  /**
   * @param {{
   *   dataprev?: { enrich: Function },
   *   bureau?: { enrich: Function },
   *   peticao?: { enrich: Function },
   *   log?: { info: Function },
   * }} [deps]
   */
  constructor(deps = {}) {
    this.dataprev = deps.dataprev || new DataprevOficialConnector();
    this.bureau = deps.bureau || new SerasaQuodConnector();
    this.peticao = deps.peticao || new PeticaoTemplateConnector();
    this.log = deps.log || console;
  }

  _emit({ trace_id, lead_id, strategy, connector, status, duration_ms, error }) {
    this.log.info(
      JSON.stringify({
        engine: 'AURORA',
        trace_id,
        lead_id,
        strategy,
        connector,
        status,
        duration_ms,
        error,
      })
    );
  }

  /**
   * @param {object} lead — deve incluir `cpf` quando aplicável
   * @param {'A'|'B'|'C'|'D'|'cascade'|'peticao'} strategy
   * @param {{ lgpdAuditLogged?: boolean, auditId?: string, trace_id?: string }} ctx
   */
  async enrich(lead, strategy, ctx) {
    const trace_id = ctx.trace_id || `tr_${Date.now()}`;
    const t0 = Date.now();
    const lead_id = lead?.lead_id || null;

    if (strategy === 'D' || strategy === 'peticao') {
      const input = {
        template_id: lead.template_id || 'auxilio_doenca_incapacidade_v1',
        dados_cliente: lead.dados_cliente || lead,
        lead_id: lead.lead_id || lead_id || `lead_${Date.now()}`,
      };
      const r = await withRetry(() => withTimeout(this.peticao.enrich(input, ctx), TIMEOUT_MS), {
        retries: 1,
      });
      this._emit({
        trace_id,
        lead_id: input.lead_id,
        strategy: 'D',
        connector: 'peticao_template',
        status: 'ok',
        duration_ms: Date.now() - t0,
      });
      return { strategy: 'D', trace_id, peticao: r };
    }

    if (strategy === 'A') {
      try {
        const r = await withRetry(
          () =>
            withTimeout(
              this.dataprev.enrich(
                { cpf: lead.cpf, finalidade: 'revisao_indeferimento_inss', convenio_id: lead.convenio_id },
                ctx
              ),
              TIMEOUT_MS
            ),
          { retries: 1 }
        );
        this._emit({
          trace_id,
          lead_id,
          strategy: 'A',
          connector: 'dataprev',
          status: 'ok',
          duration_ms: Date.now() - t0,
        });
        return { strategy: 'A', trace_id, dataprev: r };
      } catch (e) {
        this._emit({
          trace_id,
          lead_id,
          strategy: 'A',
          connector: 'dataprev',
          status: 'fail',
          duration_ms: Date.now() - t0,
          error: String(e.message || e),
        });
        throw e;
      }
    }

    if (strategy === 'B') {
      const r = await withRetry(
        () => withTimeout(this.bureau.enrich({ cpf: lead.cpf, produto: lead.produto || 'telefone' }, ctx), TIMEOUT_MS),
        { retries: 1 }
      );
      this._emit({
        trace_id,
        lead_id,
        strategy: 'B',
        connector: 'serasa_quod',
        status: 'ok',
        duration_ms: Date.now() - t0,
      });
      return { strategy: 'B', trace_id, bureau: r };
    }

    if (strategy === 'C') {
      this._emit({
        trace_id,
        lead_id,
        strategy: 'C',
        connector: 'consent_form',
        status: 'info',
        duration_ms: Date.now() - t0,
      });
      return {
        strategy: 'C',
        trace_id,
        landing: '/sou-indeferido',
        mensagem:
          'Comandante Baesso: o caminho C requer consentimento explícito na landing pública. Motor AURORA direciona para /sou-indeferido.',
      };
    }

    if (strategy === 'cascade') {
      const out = { trace_id, strategy: 'cascade', results: {} };
      try {
        out.results.A = await withRetry(
          () =>
            withTimeout(
              this.dataprev.enrich(
                { cpf: lead.cpf, finalidade: 'revisao_indeferimento_inss', convenio_id: lead.convenio_id },
                ctx
              ),
              TIMEOUT_MS
            ),
          { retries: 1 }
        );
        this._emit({
          trace_id,
          lead_id,
          strategy: 'cascade',
          connector: 'dataprev',
          status: 'ok',
          duration_ms: Date.now() - t0,
        });
        return out;
      } catch (eA) {
        this._emit({
          trace_id,
          lead_id,
          strategy: 'cascade',
          connector: 'dataprev',
          status: 'fail',
          duration_ms: Date.now() - t0,
          error: String(eA.message || eA),
        });
      }
      try {
        out.results.B = await withRetry(
          () =>
            withTimeout(this.bureau.enrich({ cpf: lead.cpf, produto: lead.produto || 'completo' }, ctx), TIMEOUT_MS),
          { retries: 1 }
        );
        this._emit({
          trace_id,
          lead_id,
          strategy: 'cascade',
          connector: 'serasa_quod',
          status: 'ok',
          duration_ms: Date.now() - t0,
        });
        return out;
      } catch (eB) {
        this._emit({
          trace_id,
          lead_id,
          strategy: 'cascade',
          connector: 'serasa_quod',
          status: 'fail',
          duration_ms: Date.now() - t0,
          error: String(eB.message || eB),
        });
      }
      out.results.C = {
        landing: '/sou-indeferido',
        mensagem:
          'Comandante Baesso: caminhos A e B indisponíveis ou sem resultado. Solicite consentimento (C) ou prossiga com petição-modelo (D).',
      };
      try {
        const dInput = {
          template_id: lead.template_id || 'auxilio_doenca_incapacidade_v1',
          dados_cliente: lead.dados_cliente || lead,
          lead_id: lead.lead_id || lead_id || `lead_${Date.now()}`,
        };
        out.results.D = await withRetry(() => withTimeout(this.peticao.enrich(dInput, ctx), TIMEOUT_MS), {
          retries: 1,
        });
        this._emit({
          trace_id,
          lead_id,
          strategy: 'cascade',
          connector: 'peticao_template',
          status: 'ok',
          duration_ms: Date.now() - t0,
        });
      } catch (eD) {
        this._emit({
          trace_id,
          lead_id,
          strategy: 'cascade',
          connector: 'peticao_template',
          status: 'fail',
          duration_ms: Date.now() - t0,
          error: String(eD.message || eD),
        });
        out.results.D = { erro: String(eD.message || eD) };
      }
      return out;
    }

    const e = new Error(`Estratégia desconhecida: ${strategy}`);
    e.statusCode = 400;
    throw e;
  }
}

module.exports = { AuroraEnricher };
