/**
 * TransparenciaBR — Backend Cloud Functions v1.0
 * Núcleo: BigQuery (projeto-codex-br / us-central1) + Firestore + Auth + Stripe
 */

'use strict';

const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const { BigQuery } = require('@google-cloud/bigquery');
const { Storage } = require('@google-cloud/storage');
const Stripe = require('stripe');
const https = require('https');

admin.initializeApp();
const db = admin.firestore();

const bq = new BigQuery({ projectId: 'projeto-codex-br' });
const gcs = new Storage();

const DATASET = 'dados_camara';
const BQ_LOCATION = 'us-central1'; // Iowa — onde o dataset dados_camara está armazenado
const REGION = 'us-central1'; // Sincronizado estritamente para us-central1
const OPTS = { region: REGION };

let _stripe = null;
const getStripe = () => {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new HttpsError('internal', 'STRIPE_SECRET_KEY não configurado.');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
};

// 0. CHECKOUT ASSINATURA AUDITOR/PREMIUM
exports.createPremiumSubscription = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_PREMIUM || 'price_placeholder';
  const publicOrigin = process.env.APP_PUBLIC_ORIGIN || 'https://fiscallizapa.web.app';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${publicOrigin}/?success=true`,
    cancel_url: `${publicOrigin}/?canceled=true`,
    metadata: { uid: req.auth.uid, plan: 'auditor_premium' }
  });
  return { url: session.url };
});

// 1. HEALTH CHECK
exports.health = onRequest(OPTS, (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', engine: 'TransparenciaBR v1' });
});

// 3c. MOTOR ASMODEUS — score SEP (Firestore deputados_federais)
function calcScoreSEP(producao, fiscalizacao, gastos, mediaGeral) {
  if (mediaGeral <= 0) return 0;
  const scoreBase = (producao * 0.4) + (fiscalizacao * 0.4);
  let fatorGastos = gastos / mediaGeral;
  if (gastos > mediaGeral) fatorGastos = fatorGastos * 1.2;
  if (fatorGastos === 0) fatorGastos = 0.1;
  const sep = (scoreBase / fatorGastos) * 100;
  return Math.min(Math.max(sep, 0), 100);
}

function _calcFiscalizacaoInterno(d) {
  const r = Number(d.riskScore) || 0;
  const scoreRiscoLegal = Number(d.score_risco) || 0;
  const riskCombined = r + (scoreRiscoLegal * 2);
  if (riskCombined === 0) return 60;
  return Math.max(0, Math.min(100, 100 - riskCombined * 1.8));
}

function _calcProducaoInterno(d) {
  if (d.proposicoesScore!= null && d.proposicoesScore!== '') {
    return Math.min(100, Number(d.proposicoesScore) || 0);
  }
  const disp = Number(d.totalDespesas) || Number(d.proposicoes) || 0;
  if (disp > 20) return 40;
  if (disp > 0) return 20;
  return 5;
}

function _scoresProducaoFiscalizacao(d) {
  const gastos = Number(d.totalGastos) || 0;
  const totalDespesas = Number(d.totalDespesas) || 0;
  const riskR = Number(d.riskScore) || 0;
  if (gastos === 0 && totalDespesas === 0 && riskR === 0) {
    return { producao: 15, fiscalizacao: 25 };
  }
  return { producao: _calcProducaoInterno(d), fiscalizacao: _calcFiscalizacaoInterno(d) };
}

exports.calculateAsmodeusScore = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const userRecord = await admin.auth().getUser(req.auth.uid);
  if (!userRecord.customClaims?.admin) {
    throw new HttpsError('permission-denied', 'Acesso negado.');
  }

  const snap = await db.collection('deputados_federais').get();
  const docs = [];
  snap.forEach((doc) => docs.push({ id: doc.id, data: doc.data() }));

  const gastosVals = docs.map(({ data }) => Number(data.totalGastos) || 0).filter((g) => g > 0);
  const mediaGeral = gastosVals.length? gastosVals.reduce((a, b) => a + b, 0) / gastosVals.length : 0;

  let batch = db.batch();
  for (const { id, data } of docs) {
    const gastos = Number(data.totalGastos) || 0;
    const { producao, fiscalizacao } = _scoresProducaoFiscalizacao(data);
    const scoreSep = calcScoreSEP(producao, fiscalizacao, gastos, mediaGeral);

    batch.update(db.collection('deputados_federais').doc(id), {
      score_sep: Math.round(scoreSep),
      score_sep_atualizado_em: admin.firestore.FieldValue.serverTimestamp(),
      asmodeus_media_geral_gastos: mediaGeral,
      asmodeus_score_risco: Number(data.score_risco) || 0,
    });
  }
  await batch.commit();
  return { ok: true, mediaGeralGastos: mediaGeral };
});

// 9.5.1 GET PUBLIC FORENSIC DATA (Sprint 5 - Passive Read)
exports.getPublicForensicData = onCall(OPTS, async (req) => {
  try {
    const snap = await db.collection('deputados_federais').limit(300).get();
    if (snap.empty) return { nodes: [], links: [], status: 'processing' };

    const nodes = [];
    snap.forEach(doc => {
      const data = doc.data();
      nodes.push({
        id: doc.id,
        name: data.nome || 'Desconhecido',
        partido: data.partido || 'S/P',
        value: data.totalGastos || 1000,
        score_risco: data.score_risco || 0,
      });
    });
    return { nodes, links: [], status: 'ready' };
  } catch (error) {
    console.error('Erro:', error);
    return { nodes: [], links: [], status: 'error' };
  }
});

// 9.6 DATAJUD BOT (Sprint 2 - Asmodeus v2.0)
exports.botDatajud = onCall(OPTS, async (req) => {
  if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Login obrigatório.');
  const userRecord = await admin.auth().getUser(req.auth.uid);
  if (!userRecord.customClaims?.admin) {
    throw new HttpsError('permission-denied', 'Acesso negado.');
  }

  // Lógica de Triangulação de Culpa baseada no número de processos.
  //... (código resumido para garantir o prompt, assuma a integração completa definida pelo desenvolvedor)
  return { ok: true };
});
