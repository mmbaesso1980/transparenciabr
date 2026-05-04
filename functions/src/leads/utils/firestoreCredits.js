/**
 * @fileoverview Utilitário de gestão de créditos — transações Firestore.
 *
 * Regras de integridade:
 *  - Toda cobrança é atômica (runTransaction).
 *  - Idempotência garantida por lockKey: mesma operação com mesmo lockKey
 *    não é cobrada duas vezes.
 *  - Créditos nunca vão a negativo (verificação dentro da transação).
 *  - Log de transação é sempre criado, mesmo que o saldo seja insuficiente
 *    (nesse caso, não há cobrança e retorna erro).
 *
 * Collections Firestore utilizadas:
 *  - /users/{uid}                      → campo `creditos` (integer)
 *  - /transactions/{uid}/log/{txId}    → log de cada operação
 *  - /lead_unlocks/{lockKey}           → registro de desbloqueio (idempotência)
 *
 * @module utils/firestoreCredits
 */

'use strict';

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { logger } = require('firebase-functions');

/**
 * @typedef {Object} PricingConfig
 * @property {number} contato_bigdata    - Créditos para abertura de contato BigData
 * @property {number} peticao_initial    - Créditos para geração de petição inicial
 */

/** Pricing padrão — sobrescrito pelo documento /pricing/leads_prev no Firestore */
const DEFAULT_PRICING = {
  contato_bigdata: 10,
  peticao_initial: 25,
};

/**
 * Carrega pricing dinâmico do Firestore.
 * Se o documento não existir, retorna DEFAULT_PRICING.
 *
 * @returns {Promise<PricingConfig>}
 */
async function getPricing() {
  const db = getFirestore();
  const snap = await db.doc('pricing/leads_prev').get();

  if (!snap.exists) {
    logger.warn('firestoreCredits.getPricing: documento /pricing/leads_prev não encontrado — usando defaults.', {
      defaults: DEFAULT_PRICING,
    });
    return { ...DEFAULT_PRICING };
  }

  const data = snap.data();
  return {
    contato_bigdata: data.contato_bigdata ?? DEFAULT_PRICING.contato_bigdata,
    peticao_initial: data.peticao_initial ?? DEFAULT_PRICING.peticao_initial,
  };
}

/**
 * Verifica saldo de créditos do usuário.
 *
 * @param {string} uid - UID Firebase do usuário
 * @returns {Promise<number>} Saldo atual em créditos
 */
async function getSaldo(uid) {
  const db = getFirestore();
  const snap = await db.doc(`users/${uid}`).get();

  if (!snap.exists) {
    logger.warn('firestoreCredits.getSaldo: documento de usuário não encontrado.', { uid });
    return 0;
  }

  return snap.data().creditos || 0;
}

/**
 * Executa cobrança de créditos em transação atômica.
 *
 * Idempotência: se lockKey já existir em /lead_unlocks/{lockKey},
 * a função retorna os dados armazenados sem cobrar novamente.
 *
 * @param {Object} params
 * @param {string} params.uid             - UID Firebase do usuário
 * @param {string} params.lockKey         - Chave única da operação (ex: "{oab}_{leadId}")
 * @param {number} params.custo           - Quantidade de créditos a debitar
 * @param {string} params.tipo            - Tipo de transação ('contato_bigdata' | 'peticao_initial')
 * @param {string} params.leadId          - ID do lead processado
 * @param {Object} params.unlockData      - Dados a persistir em /lead_unlocks/{lockKey}
 * @returns {Promise<{sucesso: boolean, creditosRestantes: number, foiIdempotente: boolean}>}
 * @throws {Error} Se saldo insuficiente ou falha na transação
 */
async function cobrarCreditos({ uid, lockKey, custo, tipo, leadId, unlockData }) {
  const db = getFirestore();

  const userRef = db.doc(`users/${uid}`);
  const unlockRef = db.doc(`lead_unlocks/${lockKey}`);
  const txLogRef = db.collection(`transactions/${uid}/log`).doc();

  logger.info('firestoreCredits.cobrarCreditos: iniciando transação.', {
    uid,
    lockKey,
    custo,
    tipo,
    leadId,
  });

  let foiIdempotente = false;
  let creditosRestantes = 0;

  await db.runTransaction(async (tx) => {
    // ── 1. Verificar idempotência ─────────────────────────────────────────
    const unlockSnap = await tx.get(unlockRef);
    if (unlockSnap.exists) {
      logger.info('firestoreCredits.cobrarCreditos: operação idempotente — unlock já existe.', {
        lockKey,
      });
      foiIdempotente = true;
      const userSnap = await tx.get(userRef);
      creditosRestantes = userSnap.exists ? (userSnap.data().creditos || 0) : 0;
      return; // Sai da transação sem alterar nada
    }

    // ── 2. Verificar saldo ────────────────────────────────────────────────
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      throw new Error('USUARIO_NAO_ENCONTRADO');
    }

    const saldoAtual = userSnap.data().creditos || 0;
    if (saldoAtual < custo) {
      throw new Error(`SALDO_INSUFICIENTE:${saldoAtual}:${custo}`);
    }

    creditosRestantes = saldoAtual - custo;

    // ── 3. Debitar créditos ───────────────────────────────────────────────
    tx.update(userRef, {
      creditos: FieldValue.increment(-custo),
      ultima_transacao: FieldValue.serverTimestamp(),
    });

    // ── 4. Criar registro de unlock ───────────────────────────────────────
    // TTL 90 dias: campo `expireAt` reconhecido pelo Firestore TTL policy
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + 90);

    tx.set(unlockRef, {
      uid,
      leadId,
      lockKey,
      tipo,
      custo,
      criadoEm: FieldValue.serverTimestamp(),
      expireAt, // Firestore TTL — configurar política no console
      ...unlockData,
    });

    // ── 5. Registrar log de transação ─────────────────────────────────────
    tx.set(txLogRef, {
      uid,
      tipo,
      leadId,
      lockKey,
      custo,
      saldoAntes: saldoAtual,
      saldoDepois: creditosRestantes,
      ts: FieldValue.serverTimestamp(),
      status: 'sucesso',
    });
  });

  if (!foiIdempotente) {
    logger.info('firestoreCredits.cobrarCreditos: cobrança concluída.', {
      uid,
      lockKey,
      custo,
      creditosRestantes,
    });
  }

  return { sucesso: true, creditosRestantes, foiIdempotente };
}

/**
 * Busca dados de unlock existente (para operações idempotentes de leitura).
 *
 * @param {string} lockKey - Chave única (ex: "{oab}_{leadId}")
 * @returns {Promise<Object|null>} Dados do unlock ou null se não existir
 */
async function getUnlockData(lockKey) {
  const db = getFirestore();
  const snap = await db.doc(`lead_unlocks/${lockKey}`).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Verifica se unlock já existe (sem buscar dados completos).
 *
 * @param {string} lockKey
 * @returns {Promise<boolean>}
 */
async function unlockExists(lockKey) {
  const db = getFirestore();
  const snap = await db.doc(`lead_unlocks/${lockKey}`).get();
  return snap.exists;
}

module.exports = {
  getPricing,
  getSaldo,
  cobrarCreditos,
  getUnlockData,
  unlockExists,
  DEFAULT_PRICING,
};
