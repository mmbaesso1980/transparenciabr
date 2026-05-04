/**
 * @fileoverview Cloud Function HTTP callable — openContactBigData
 *
 * Abre os dados de contato (telefone, e-mail, endereço) de um lead previdenciário
 * via BigDataCorp, após verificação anti-desperdício no PJe TRF3.
 *
 * Paywall: desconta créditos do usuário conforme pricing em /pricing/leads_prev.
 * Idempotência: mesmo OAB + leadId nunca é cobrado duas vezes.
 *
 * Path destino no repo: functions/src/leads/openContactBigData.js
 *
 * @module openContactBigData
 */

'use strict';

const functions = require('firebase-functions');
const { logger } = require('firebase-functions');
const { HttpsError } = require('firebase-functions/v2/https');

const bigDataAdapter = require('./adapters/bigDataAdapter');
const pjeAdapter = require('./adapters/pjeAdapter');
const { fetchLeadByHash, marcarDesqualificado } = require('./utils/bqLeadFetcher');
const {
  getPricing,
  getSaldo,
  cobrarCreditos,
  getUnlockData,
} = require('./utils/firestoreCredits');

/**
 * Cloud Function HTTPS callable: openContactBigData
 *
 * Input: { leadId: string, advogadoOAB: string }
 * Auth: obrigatória (context.auth)
 *
 * @type {functions.HttpsFunction}
 */
exports.openContactBigData = functions.https.onCall(
  {
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (data, context) => {
    // ══════════════════════════════════════════════════════════════════════
    // 1. AUTENTICAÇÃO
    // ══════════════════════════════════════════════════════════════════════
    if (!context.auth) {
      logger.warn('openContactBigData: tentativa sem autenticação.');
      throw new HttpsError(
        'unauthenticated',
        'Autenticação obrigatória para acessar dados de contato.'
      );
    }

    const uid = context.auth.uid;

    // ══════════════════════════════════════════════════════════════════════
    // 2. VALIDAÇÃO DE INPUT
    // ══════════════════════════════════════════════════════════════════════
    const { leadId, advogadoOAB } = data || {};

    if (!leadId || typeof leadId !== 'string' || leadId.trim().length === 0) {
      throw new HttpsError('invalid-argument', 'leadId é obrigatório e deve ser uma string válida.');
    }

    if (!advogadoOAB || typeof advogadoOAB !== 'string' || advogadoOAB.trim().length === 0) {
      throw new HttpsError(
        'permission-denied',
        'advogadoOAB é obrigatório. ' +
          'TODO: validação de OAB via API oficial será implementada na Sprint 2.'
      );
    }

    const leadIdLimpo = leadId.trim();
    const oabLimpo = advogadoOAB.trim().toUpperCase();

    // Chave de idempotência para unlock
    const lockKey = `${oabLimpo}_${leadIdLimpo}`;

    logger.info('openContactBigData: iniciando processamento.', {
      uid,
      oab: oabLimpo,
      leadId: leadIdLimpo.slice(0, 8) + '...',
      lockKey,
    });

    // ══════════════════════════════════════════════════════════════════════
    // 3. VERIFICAR IDEMPOTÊNCIA — unlock já existe?
    // ══════════════════════════════════════════════════════════════════════
    try {
      const unlockExistente = await getUnlockData(lockKey);
      if (unlockExistente) {
        logger.info('openContactBigData: retornando dados cacheados (idempotente).', { lockKey });

        const saldoAtual = await getSaldo(uid);
        return {
          success: true,
          contact: {
            phones: unlockExistente.phones || [],
            emails: unlockExistente.emails || [],
            address: unlockExistente.address || null,
          },
          pjeStatus: unlockExistente.pjeStatus || null,
          creditsRemaining: saldoAtual,
          fromCache: true,
        };
      }
    } catch (err) {
      logger.error('openContactBigData: erro ao verificar unlock existente.', { message: err.message });
      throw new HttpsError('internal', 'Erro ao verificar histórico de desbloqueio.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // 4. BUSCAR LEAD NO BIGQUERY
    // ══════════════════════════════════════════════════════════════════════
    let lead;
    try {
      lead = await fetchLeadByHash(leadIdLimpo);
    } catch (err) {
      logger.error('openContactBigData: erro ao buscar lead no BQ.', { message: err.message });
      throw new HttpsError('internal', 'Erro ao consultar base de dados de leads.');
    }

    if (!lead) {
      throw new HttpsError('not-found', `Lead ${leadIdLimpo} não encontrado na base de dados.`);
    }

    if (lead.status_lead === 'desqualificado') {
      throw new HttpsError(
        'failed-precondition',
        'Este lead já foi desqualificado e não pode ser processado.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 5. CHECK ANTI-DESPERDÍCIO — PJe TRF3
    // ══════════════════════════════════════════════════════════════════════
    let pjeStatus = null;
    try {
      const pjeResult = await pjeAdapter.checkProcessExists(lead.cpf, {
        dataIndeferimento: lead.dt_indeferimento,
      });

      pjeStatus = {
        hasProcessAfterIndeferimento: pjeResult.hasProcessAfterIndeferimento,
        reason: pjeResult.reason,
        numeroProcesso: pjeResult.numeroProcesso,
        isMock: pjeResult.isMock,
      };

      if (pjeResult.hasProcessAfterIndeferimento === true) {
        // Lead desqualificado — marcar no BQ (fire-and-forget, não bloqueia)
        marcarDesqualificado(leadIdLimpo, 'processo_pje_existente').catch((e) =>
          logger.error('openContactBigData: falha ao marcar desqualificado no BQ.', {
            message: e.message,
          })
        );

        logger.warn('openContactBigData: PJe indica processo existente — lead desqualificado.', {
          leadId: leadIdLimpo.slice(0, 8) + '...',
          numeroProcesso: pjeResult.numeroProcesso,
        });

        throw new HttpsError(
          'failed-precondition',
          'Este lead já possui processo judicial ativo no PJe (lead_already_processed). ' +
            'Nenhum crédito foi cobrado.'
        );
      }
    } catch (err) {
      // Re-lança HttpsError diretamente
      if (err instanceof HttpsError) throw err;

      // Falha técnica no PJe — log e segue (não bloqueia por falha do adapter)
      logger.error('openContactBigData: falha no adapter PJe — seguindo sem verificação.', {
        message: err.message,
      });
      pjeStatus = { hasProcessAfterIndeferimento: null, reason: 'adapter_error', isMock: false };
    }

    // ══════════════════════════════════════════════════════════════════════
    // 6. PRICING DINÂMICO
    // ══════════════════════════════════════════════════════════════════════
    let pricing;
    try {
      pricing = await getPricing();
    } catch (err) {
      logger.error('openContactBigData: erro ao buscar pricing.', { message: err.message });
      throw new HttpsError('internal', 'Erro ao carregar tabela de preços.');
    }

    const custo = pricing.contato_bigdata;

    // ══════════════════════════════════════════════════════════════════════
    // 7. VERIFICAR SALDO
    // ══════════════════════════════════════════════════════════════════════
    let saldoAtual;
    try {
      saldoAtual = await getSaldo(uid);
    } catch (err) {
      throw new HttpsError('internal', 'Erro ao consultar saldo de créditos.');
    }

    if (saldoAtual < custo) {
      logger.warn('openContactBigData: saldo insuficiente.', {
        uid,
        saldo: saldoAtual,
        custo,
      });
      throw new HttpsError(
        'resource-exhausted',
        `Créditos insuficientes. Saldo: ${saldoAtual}. Necessário: ${custo}. ` +
          'Adquira mais créditos para continuar. (insufficient_credits)'
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 8. CONSULTAR BIGDATACORP
    // ══════════════════════════════════════════════════════════════════════
    let contactData;
    try {
      contactData = await bigDataAdapter.fetchContact(lead.cpf);
    } catch (err) {
      logger.error('openContactBigData: falha na consulta BigDataCorp.', {
        message: err.message,
      });
      throw new HttpsError(
        'internal',
        'Falha ao consultar base de dados de contato. Tente novamente em instantes.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // 9. TRANSAÇÃO FIRESTORE: cobrar + registrar unlock + log
    // ══════════════════════════════════════════════════════════════════════
    let resultadoCobranca;
    try {
      resultadoCobranca = await cobrarCreditos({
        uid,
        lockKey,
        custo,
        tipo: 'contato_bigdata',
        leadId: leadIdLimpo,
        unlockData: {
          oab: oabLimpo,
          phones: contactData.phones,
          emails: contactData.emails,
          address: contactData.address,
          pjeStatus,
          isMock: contactData.isMock || false,
          leadEspecie: lead.especie_beneficio,
          leadUf: lead.uf,
        },
      });
    } catch (err) {
      // Trata erros conhecidos da transação
      if (err.message?.startsWith('SALDO_INSUFICIENTE')) {
        throw new HttpsError(
          'resource-exhausted',
          'Créditos insuficientes (verificação concorrente). (insufficient_credits)'
        );
      }
      if (err.message === 'USUARIO_NAO_ENCONTRADO') {
        throw new HttpsError('not-found', 'Usuário não encontrado no sistema.');
      }

      logger.error('openContactBigData: falha na transação de cobrança.', {
        message: err.message,
      });
      throw new HttpsError('internal', 'Erro ao processar cobrança. Nenhum crédito foi debitado.');
    }

    // ══════════════════════════════════════════════════════════════════════
    // 10. RETORNO
    // ══════════════════════════════════════════════════════════════════════
    logger.info('openContactBigData: processamento concluído com sucesso.', {
      uid,
      lockKey,
      custo,
      creditsRemaining: resultadoCobranca.creditosRestantes,
      foiIdempotente: resultadoCobranca.foiIdempotente,
      isMock: contactData.isMock,
    });

    return {
      success: true,
      contact: {
        phones: contactData.phones,
        emails: contactData.emails,
        address: contactData.address,
      },
      pjeStatus,
      creditsRemaining: resultadoCobranca.creditosRestantes,
      fromCache: false,
      _meta: {
        isMock: contactData.isMock || false,
        mockReason: contactData.reason || null,
      },
    };
  }
);
