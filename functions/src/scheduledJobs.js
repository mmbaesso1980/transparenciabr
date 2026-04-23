/**
 * functions/src/scheduledJobs.js
 *
 * Cloud Functions agendadas (Cloud Scheduler) para o TransparênciaBR.
 * Todas configuradas para o timezone America/Sao_Paulo (UTC-3).
 *
 * Cronograma diário:
 *   02:00 — ingestEmendasPix (delta do dia)
 *   02:30 — ingestEmendasRp6
 *   03:00 — ingestCeapCamara
 *   03:30 — ingestVotacoesCamara
 *   04:00 — aggregateParlamentarCounters
 *   04:30 — recalcAllScores
 *   05:00 — syncBodes (BigQuery → Firestore)
 *   06:00 — syncAgendaDia
 *   00:00 — renovarCotasDiarias (Missão 36)
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Configuração comum para todas as agendadas
const SCHEDULE_OPTS = {
  timeZone: 'America/Sao_Paulo',
  region: 'southamerica-east1',
  memory: '1GiB',
  timeoutSeconds: 540, // 9 min (máximo de funções v2 agendadas)
  retryCount: 2,
};

// ═══════════════════════════════════════════════════════════
// HELPER — registra execução na collection admin_cronjobs
// ═══════════════════════════════════════════════════════════
async function registrarExecucao(nome, status, detalhes = {}) {
  try {
    await db.collection('admin_cronjobs').add({
      nome,
      status, // 'SUCESSO' | 'ERRO' | 'INICIADO'
      detalhes,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.warn('Falha ao registrar execução de cronjob', { nome, err: err.message });
  }
}

async function runJob(nome, fn) {
  const startTs = Date.now();
  logger.info(`🚀 [${nome}] Iniciando`);
  await registrarExecucao(nome, 'INICIADO');
  try {
    const resultado = await fn();
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    logger.info(`✅ [${nome}] Concluído em ${elapsed}s`, { resultado });
    await registrarExecucao(nome, 'SUCESSO', { elapsed, resultado });
    return resultado;
  } catch (err) {
    const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
    logger.error(`❌ [${nome}] Falhou em ${elapsed}s`, { error: err.message, stack: err.stack });
    await registrarExecucao(nome, 'ERRO', { elapsed, error: err.message });
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
// 1. INGESTÃO DE EMENDAS PIX — 02:00 diário
// ═══════════════════════════════════════════════════════════
exports.ingestEmendasPix = onSchedule(
  { schedule: '0 2 * * *', ...SCHEDULE_OPTS },
  async () => {
    return runJob('ingestEmendasPix', async () => {
      const { ingestEmendasPix } = require('../jobs/ingest-emendas-pix');
      const anoCorrente = new Date().getFullYear();
      const total = await ingestEmendasPix({ ano: anoCorrente, modo: 'delta' });
      return { ano: anoCorrente, emendasIngeridas: total };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 2. INGESTÃO DE EMENDAS RP6 — 02:30 diário
// ═══════════════════════════════════════════════════════════
exports.ingestEmendasRp6 = onSchedule(
  { schedule: '30 2 * * *', ...SCHEDULE_OPTS },
  async () => {
    return runJob('ingestEmendasRp6', async () => {
      const { ingestEmendasRp6 } = require('../jobs/ingest-emendas-rp6');
      const anoCorrente = new Date().getFullYear();
      const total = await ingestEmendasRp6({ ano: anoCorrente, modo: 'delta' });
      return { ano: anoCorrente, emendasIngeridas: total };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 3. INGESTÃO CEAP CÂMARA — 03:00 diário
// ═══════════════════════════════════════════════════════════
exports.ingestCeapCamara = onSchedule(
  { schedule: '0 3 * * *', ...SCHEDULE_OPTS, timeoutSeconds: 540 },
  async () => {
    return runJob('ingestCeapCamara', async () => {
      const { ingestCeapCamara } = require('../jobs/ingest-ceap-camara');
      const hoje = new Date();
      const total = await ingestCeapCamara({
        ano: hoje.getFullYear(),
        mes: hoje.getMonth() + 1, // mês atual
        modo: 'delta',
      });
      return { emendasIngeridas: total };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 4. INGESTÃO VOTAÇÕES CÂMARA — 03:30 diário
// ═══════════════════════════════════════════════════════════
exports.ingestVotacoesCamara = onSchedule(
  { schedule: '30 3 * * *', ...SCHEDULE_OPTS },
  async () => {
    return runJob('ingestVotacoesCamara', async () => {
      const { ingestVotacoesCamara } = require('../jobs/ingest-votacoes-camara');
      const ontem = new Date();
      ontem.setDate(ontem.getDate() - 1);
      const total = await ingestVotacoesCamara({
        dataInicio: ontem.toISOString().split('T')[0],
        dataFim: new Date().toISOString().split('T')[0],
      });
      return { votacoesIngeridas: total };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 5. AGREGAÇÃO DE CONTADORES — 04:00 diário
// ═══════════════════════════════════════════════════════════
exports.aggregateParlamentarCounters = onSchedule(
  { schedule: '0 4 * * *', ...SCHEDULE_OPTS, memory: '2GiB' },
  async () => {
    return runJob('aggregateParlamentarCounters', async () => {
      const { aggregateAll } = require('../jobs/aggregate-counters');
      const resultado = await aggregateAll();
      return resultado; // { camara: N, senado: M }
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 6. RECÁLCULO SCORES ASMODEUS — 04:30 diário
// ═══════════════════════════════════════════════════════════
exports.recalcAllScores = onSchedule(
  { schedule: '30 4 * * *', ...SCHEDULE_OPTS, memory: '2GiB' },
  async () => {
    return runJob('recalcAllScores', async () => {
      const { recalcAll } = require('../jobs/recalc-scores');
      const resultado = await recalcAll();
      return resultado; // { processados, distribuicao }
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 7. SYNC BIGQUERY → FIRESTORE — 05:00 diário
// ═══════════════════════════════════════════════════════════
exports.syncBodes = onSchedule(
  { schedule: '0 5 * * *', ...SCHEDULE_OPTS },
  async () => {
    return runJob('syncBodes', async () => {
      const { syncBodesFromBigQuery } = require('../jobs/sync-bodes');
      const total = await syncBodesFromBigQuery();
      return { alertasSincronizados: total };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 8. SYNC AGENDA DO DIA — 06:00 diário
// ═══════════════════════════════════════════════════════════
exports.syncAgendaDia = onSchedule(
  { schedule: '0 6 * * *', ...SCHEDULE_OPTS },
  async () => {
    return runJob('syncAgendaDia', async () => {
      const { syncAgendaHoje } = require('../jobs/sync-agenda');
      const total = await syncAgendaHoje();
      return { eventosIngeridos: total };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 9. RENOVAÇÃO DE COTAS FREEMIUM — 00:00 diário (Missão 36)
// ═══════════════════════════════════════════════════════════
exports.renovarCotasDiarias = onSchedule(
  { schedule: '0 0 * * *', ...SCHEDULE_OPTS },
  async () => {
    return runJob('renovarCotasDiarias', async () => {
      const snapshot = await db.collection('usuarios').get();
      let processados = 0;
      let batch = db.batch();
      let batchCount = 0;

      for (const doc of snapshot.docs) {
        batch.update(doc.ref, {
          dossiesGratuitosRestantes: 3,
          ultimaRenovacaoCota: admin.firestore.FieldValue.serverTimestamp(),
        });
        batchCount += 1;
        processados += 1;

        if (batchCount >= 450) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }

      if (batchCount > 0) await batch.commit();
      return { usuariosRenovados: processados };
    });
  }
);

// ═══════════════════════════════════════════════════════════
// 10. HEALTHCHECK SEMANAL — domingo 07:00
// ═══════════════════════════════════════════════════════════
exports.healthcheckSemanal = onSchedule(
  { schedule: '0 7 * * 0', ...SCHEDULE_OPTS },
  async () => {
    return runJob('healthcheckSemanal', async () => {
      const [parls, emendas, ceap, votos, usuarios] = await Promise.all([
        db.collection('parlamentares').count().get(),
        db.collection('emendas_pix').count().get(),
        db.collection('despesas_ceap').count().get(),
        db.collection('votos').count().get(),
        db.collection('usuarios').count().get(),
      ]);

      const stats = {
        parlamentares: parls.data().count,
        emendasPix: emendas.data().count,
        despesasCeap: ceap.data().count,
        votos: votos.data().count,
        usuarios: usuarios.data().count,
        data: new Date().toISOString(),
      };

      await db.collection('admin_health').add(stats);
      logger.info('📊 Healthcheck semanal', stats);
      return stats;
    });
  }
);
