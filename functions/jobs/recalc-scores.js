/**
 * Adapter do scripts/recalc-all-scores.js para scheduled functions.
 */
const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

let calculateAsmodeusScore;
try {
  const mod = require('../src/calculateAsmodeusScore');
  calculateAsmodeusScore = mod.calculateAsmodeusScore || mod.default || mod;
  if (typeof calculateAsmodeusScore !== 'function') throw new Error('não é função');
} catch (err) {
  logger.warn(`Fallback ativo: ${err.message}`);
  calculateAsmodeusScore = require('./fallback-score').fallbackCalculate;
}

exports.recalcAll = async function () {
  const snap = await db.collection('parlamentares').get();
  const distribuicao = { baixo: 0, moderado: 0, alto: 0, critico: 0 };
  let processados = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    try {
      const p = { id: doc.id, ...doc.data() };
      const score = await Promise.resolve(calculateAsmodeusScore(p));
      const total = Number(score.total ?? score.score ?? 0);

      if (total <= 30) distribuicao.baixo += 1;
      else if (total <= 60) distribuicao.moderado += 1;
      else if (total <= 85) distribuicao.alto += 1;
      else distribuicao.critico += 1;

      batch.set(
        doc.ref,
        {
          scoreAsmodeus: total,
          scoreBreakdown: score.breakdown || null,
          flags: Array.isArray(score.flags) ? score.flags : [],
          _scoreCalculadoEm: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      batchCount += 1;
      processados += 1;

      if (batchCount >= 450) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    } catch (err) {
      logger.error(`Erro em ${doc.id}: ${err.message}`);
    }
  }

  if (batchCount > 0) await batch.commit();
  return { processados, distribuicao };
};
