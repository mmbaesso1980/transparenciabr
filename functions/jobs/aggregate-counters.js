/**
 * Adapter que replica a lógica do scripts/aggregate-parlamentar-counters.js
 * mas exporta uma função invocável pelas scheduled functions.
 */
const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const BATCH_SIZE = 450;

function parseNumber(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function sumCollection(colName, parlamentarField, parlamentarId, valorField) {
  const snap = await db.collection(colName).where(parlamentarField, '==', parlamentarId).get();
  let total = 0;
  for (const d of snap.docs) total += parseNumber(d.data()[valorField]);
  return { total, count: snap.size, docs: snap.docs };
}

async function agregarUm(doc) {
  const p = doc.data();
  const id = doc.id;
  const casa = p.casa || 'CAMARA';
  const ceapField = casa === 'CAMARA' ? 'idDeputado' : 'idSenador';

  const [pix, rp6, rp7, rp8] = await Promise.all([
    sumCollection('emendas_pix', 'idParlamentar', id, 'valorPago'),
    sumCollection('emendas_rp6', 'idParlamentar', id, 'valorPago'),
    sumCollection('emendas_rp7', 'idParlamentar', id, 'valorPago'),
    sumCollection('emendas_rp8', 'idParlamentar', id, 'valorPago'),
  ]);

  let ceap = { total: 0, count: 0 };
  if (casa === 'CAMARA') {
    ceap = await sumCollection('despesas_ceap', ceapField, id, 'valorLiquido');
  }

  const votosSnap = await db.collection('votos').where('idParlamentar', '==', id).get();
  let qtdPresencas = 0;
  for (const v of votosSnap.docs) {
    const voto = (v.data().voto || '').toUpperCase();
    if (voto && voto !== 'AUSENTE' && voto !== 'ART17') qtdPresencas += 1;
  }
  const percentualPresenca =
    votosSnap.size > 0 ? Number(((qtdPresencas / votosSnap.size) * 100).toFixed(1)) : null;

  return {
    ref: doc.ref,
    payload: {
      totalEmendasPix: pix.total,
      totalEmendasRp6: rp6.total,
      totalEmendasRp7: rp7.total,
      totalEmendasRp8: rp8.total,
      totalEmendasGeral: pix.total + rp6.total + rp7.total + rp8.total,
      totalCEAP: ceap.total,
      qtdVotacoes: votosSnap.size,
      qtdPresencas,
      percentualPresenca,
      _agregadoEm: admin.firestore.FieldValue.serverTimestamp(),
    },
  };
}

exports.aggregateAll = async function () {
  const snap = await db.collection('parlamentares').get();
  let camara = 0;
  let senado = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    try {
      const { ref, payload } = await agregarUm(doc);
      batch.set(ref, payload, { merge: true });
      batchCount += 1;
      if (doc.data().casa === 'SENADO') senado += 1;
      else camara += 1;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    } catch (err) {
      logger.error(`Erro em ${doc.id}: ${err.message}`);
    }
  }

  if (batchCount > 0) await batch.commit();
  return { camara, senado, total: camara + senado };
};
