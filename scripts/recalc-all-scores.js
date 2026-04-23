/**
 * scripts/recalc-all-scores.js
 *
 * Recalcula Score Asmodeus para todos os parlamentares.
 *
 * Fluxo:
 *   1. Carrega o módulo de cálculo (functions/src/calculateAsmodeusScore)
 *   2. Para cada parlamentar, lê métricas agregadas + engines forenses
 *   3. Grava scoreAsmodeus + breakdown + flags no doc
 *
 * Uso:
 *   node scripts/recalc-all-scores.js
 *   node scripts/recalc-all-scores.js --only=CAMARA
 *   node scripts/recalc-all-scores.js --id=209787
 *   node scripts/recalc-all-scores.js --dry-run
 *
 * Pré-requisitos:
 *   - rodar aggregate-parlamentar-counters.js ANTES
 *   - GOOGLE_APPLICATION_CREDENTIALS=./chave-servico.json
 */

const admin = require('firebase-admin');
const path = require('path');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'fiscallizapa',
  });
}

const db = admin.firestore();
const BATCH_SIZE = 450;
const SLEEP_MS = 200;

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v ?? true;
  return acc;
}, {});

const DRY_RUN = Boolean(args['dry-run']);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Import seguro da função de cálculo ------------------------------------
let calculateAsmodeusScore;
try {
  const mod = require(path.resolve(__dirname, '../functions/src/calculateAsmodeusScore'));
  calculateAsmodeusScore = mod.calculateAsmodeusScore || mod.default || mod;
  if (typeof calculateAsmodeusScore !== 'function') {
    throw new Error('Export não é função');
  }
  console.log('✅ calculateAsmodeusScore carregado de functions/src/');
} catch (err) {
  console.warn(
    `⚠️  Não foi possível importar functions/src/calculateAsmodeusScore (${err.message}).`
  );
  console.warn('    Usando implementação fallback embutida neste script.');
  calculateAsmodeusScore = fallbackCalculate;
}

// --- Implementação fallback (caso a Cloud Function não esteja disponível) --
function fallbackCalculate(parlamentar) {
  const flags = [];
  const breakdown = {
    ceap: 0,
    emendas: 0,
    nepotismo: 0,
    votos: 0,
    flavio: 0,
  };

  const totalCEAP = parlamentar.totalCEAP || 0;
  const totalEmendas = parlamentar.totalEmendasGeral || 0;
  const presenca = parlamentar.percentualPresenca;

  // Eixo CEAP (0–20): proporcional ao valor total
  if (totalCEAP > 1_500_000) {
    breakdown.ceap = 20;
    flags.push('CEAP_ELEVADO');
  } else if (totalCEAP > 1_000_000) breakdown.ceap = 15;
  else if (totalCEAP > 500_000) breakdown.ceap = 10;
  else if (totalCEAP > 100_000) breakdown.ceap = 5;

  // Eixo Emendas (0–20): concentração alta é suspeita
  if (totalEmendas > 50_000_000) {
    breakdown.emendas = 20;
    flags.push('EMENDAS_CONCENTRADAS');
  } else if (totalEmendas > 20_000_000) breakdown.emendas = 15;
  else if (totalEmendas > 10_000_000) breakdown.emendas = 10;
  else if (totalEmendas > 2_000_000) breakdown.emendas = 5;

  // Eixo Votos (0–20): baixa presença penaliza
  if (presenca != null) {
    if (presenca < 50) {
      breakdown.votos = 20;
      flags.push('AUSENCIA_CRONICA');
    } else if (presenca < 70) breakdown.votos = 12;
    else if (presenca < 85) breakdown.votos = 5;
  }

  // Eixos nepotismo e flavio ficam em 0 até engines dedicadas rodarem
  breakdown.nepotismo = parlamentar._nepotismoScore || 0;
  breakdown.flavio = parlamentar._flavioScore || 0;

  if (breakdown.nepotismo >= 15) flags.push('NEPOTISMO_SUSPEITO');
  if (breakdown.flavio >= 15) flags.push('RACHADINHA_SUSPEITA');

  const total =
    breakdown.ceap +
    breakdown.emendas +
    breakdown.nepotismo +
    breakdown.votos +
    breakdown.flavio;

  return {
    total: Math.min(100, total),
    breakdown,
    flags,
    calculatedAt: new Date().toISOString(),
    engine: 'fallback-v1',
  };
}

// --- Runner principal ------------------------------------------------------
async function run() {
  console.log(`🚀 Recálculo de Scores Asmodeus ${DRY_RUN ? '[DRY-RUN]' : ''}`);
  const startTs = Date.now();

  let query = db.collection('parlamentares');
  if (args.only) query = query.where('casa', '==', args.only.toUpperCase());

  let docs = [];
  if (args.id) {
    const single = await db.collection('parlamentares').doc(String(args.id)).get();
    if (!single.exists) {
      console.error(`❌ Parlamentar ${args.id} não encontrado`);
      process.exit(1);
    }
    docs = [single];
  } else {
    const snap = await query.get();
    docs = snap.docs;
  }

  console.log(`📊 Calculando score para ${docs.length} parlamentares...`);

  let processados = 0;
  let comScoreValido = 0;
  let batch = db.batch();
  let batchCount = 0;
  const distribuicao = { baixo: 0, moderado: 0, alto: 0, critico: 0 };

  for (const doc of docs) {
    try {
      const parlamentar = { id: doc.id, ...doc.data() };

      // Aviso: se totalCEAP/totalEmendas estão undefined, rode aggregate antes
      if (
        parlamentar.totalCEAP === undefined &&
        parlamentar.totalEmendasGeral === undefined
      ) {
        console.warn(
          `  ⚠️  ${parlamentar.nome}: sem contadores agregados. Pule e rode aggregate-parlamentar-counters.js antes.`
        );
      }

      const score = await Promise.resolve(calculateAsmodeusScore(parlamentar));

      const scoreTotal = Number(score.total ?? score.score ?? 0);
      const flags = Array.isArray(score.flags) ? score.flags : [];

      // Distribuição para log final
      if (scoreTotal <= 30) distribuicao.baixo += 1;
      else if (scoreTotal <= 60) distribuicao.moderado += 1;
      else if (scoreTotal <= 85) distribuicao.alto += 1;
      else distribuicao.critico += 1;

      if (scoreTotal > 0) comScoreValido += 1;

      const payload = {
        scoreAsmodeus: scoreTotal,
        scoreBreakdown: score.breakdown || null,
        flags,
        _scoreCalculadoEm: admin.firestore.FieldValue.serverTimestamp(),
        _scoreEngine: score.engine || 'calculateAsmodeusScore',
      };

      if (!DRY_RUN) {
        batch.set(doc.ref, payload, { merge: true });
        batchCount += 1;
      }

      processados += 1;

      const bar =
        scoreTotal <= 30 ? '🟢' : scoreTotal <= 60 ? '🟡' : scoreTotal <= 85 ? '🟠' : '🔴';
      console.log(
        `  ${bar} [${processados}/${docs.length}] ${parlamentar.nome} ` +
          `(${parlamentar.siglaPartido || '?'}-${parlamentar.uf || '?'}) → ` +
          `${scoreTotal}/100 | flags: ${flags.length ? flags.join(',') : 'nenhuma'}`
      );

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`  💾 Commit de ${batchCount} docs`);
        batch = db.batch();
        batchCount = 0;
        await sleep(SLEEP_MS);
      }
    } catch (err) {
      console.error(`  ❌ Erro em ${doc.id}: ${err.message}`);
    }
  }

  if (batchCount > 0 && !DRY_RUN) {
    await batch.commit();
    console.log(`  💾 Commit final de ${batchCount} docs`);
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log('\n═══════════════════════════════════════');
  console.log(`✅ Processados: ${processados}`);
  console.log(`📈 Com score válido (>0): ${comScoreValido}`);
  console.log(`⏱️  Tempo total: ${elapsed}s`);
  console.log('📊 Distribuição de risco:');
  console.log(`   🟢 Baixo    (0–30):  ${distribuicao.baixo}`);
  console.log(`   🟡 Moderado (31–60): ${distribuicao.moderado}`);
  console.log(`   🟠 Alto     (61–85): ${distribuicao.alto}`);
  console.log(`   🔴 Crítico  (86–100): ${distribuicao.critico}`);
  console.log('═══════════════════════════════════════');

  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN: nenhum dado foi escrito no Firestore.');
  }
}

run().catch((err) => {
  console.error('💥 Falha fatal:', err);
  process.exit(1);
});
