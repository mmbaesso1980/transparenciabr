import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { BigQuery } from '@google-cloud/bigquery';
import { validaCpf, mascaraCpf } from './utils/cpf.js';
import { checkHardstop } from './utils/hardstop.js';
import { logEvent } from './utils/audit.js';
import { bigdataEnrich } from './utils/bigdata.js';
import { enriqueceCelular } from './osint/orquestrador.js';
import { geraCsvLgpd } from './utils/csv.js';
import { enviarMensagem, enviarDocumentoUrl } from './utils/telegram.js';

const bq = new BigQuery();

function decodePayload(event) {
  const m = event.data?.message;
  if (!m) return null;
  if (m.json) return m.json;
  if (m.data) {
    const s = Buffer.from(m.data, 'base64').toString('utf8');
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }
  return null;
}

function escSqlStr(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

/**
 * @param {{ municipios?: string[], limite_por_municipio?: number }} args
 * @param {string} jobId
 */
async function fetchLeadsFromView(args, jobId) {
  const rawMun = Array.isArray(args?.municipios) && args.municipios.length ? args.municipios : ['Valinhos', 'Vitória', 'Belém'];
  const list = rawMun.map((m) => escSqlStr(m));
  const inList = list.map((x) => `'${x}'`).join(', ');
  const per = Math.min(Math.max(Number(args?.limite_por_municipio) || 50, 1), 200);
  const lim = Math.min(per * list.length, 500);
  const sql = `
    SELECT cpf, nome, uf, municipio, motivo_indeferimento, data_indeferimento, categoria_potencial,
           score, ticket_estimado_brl, status_filter
    FROM \`transparenciabr.tbr_leads_prev.leads_quentes_hoje\`
    WHERE municipio IN (${inList})
    LIMIT ${lim}
  `;
  const [rows] = await bq.query({ query: sql, location: 'US' });
  return rows;
}

export const pipelineWorker = onMessagePublished(
  {
    topic: 'lead-pipeline-jobs',
    region: 'us-east1',
    memory: '1GiB',
    timeoutSeconds: 540,
  },
  async (event) => {
    const job = decodePayload(event);
    if (!job?.job_id || job.chat_id == null || job.chat_id === '') {
      console.error('pipelineWorker: payload inválido', job);
      return;
    }

    const jobId = job.job_id;
    const chatId = String(job.chat_id);
    const oab = (job.oab && String(job.oab).trim()) || '';
    if (!oab) {
      await logEvent({ jobId, evento: 'ERRO_OAB', detalhes: 'OAB ausente no payload' });
      await enviarMensagem(chatId, 'Não foi possível processar o job: OAB do solicitante ausente.').catch((e) => console.warn('enviarMensagem falhou (OAB):', e.message));
      return;
    }

    await logEvent({ jobId, evento: 'WORKER_INICIADO', detalhes: JSON.stringify({ comando: job.comando }) });

    const hs0 = await checkHardstop().catch((e) => {
      console.warn('checkHardstop falhou, assumindo ok:', e.message);
      return { ok: true, gasto: 0, limite: 300 };
    });
    if (!hs0.ok) {
      await logEvent({ jobId, evento: 'HARDSTOP_BLOQUEIO', detalhes: JSON.stringify(hs0) });
      await enviarMensagem(
        chatId,
        'Processamento interrompido: o teto diário de custo estimado foi atingido.'
      ).catch((e) => console.warn('enviarMensagem falhou (hardstop):', e.message));
      return;
    }

    if (job.comando !== '/report') {
      await logEvent({ jobId, evento: 'COMANDO_IGNORADO', detalhes: String(job.comando) });
      return;
    }

    let bqRows;
    try {
      bqRows = await fetchLeadsFromView(job.args || {}, jobId);
    } catch (e) {
      await logEvent({
        jobId,
        evento: 'MOTIVO_FALHA',
        detalhes: JSON.stringify({ etapa: 'BQ_VIEW', erro: String(e?.message || e) }),
      });
      await enviarMensagem(
        chatId,
        'Não foi possível ler a view de leads no BigQuery. Verifique se o dataset e a tabela base existem.'
      ).catch((e) => console.warn('enviarMensagem falhou (BQ_VIEW):', e.message));
      return;
    }

    const outCsv = [];
    const finalRows = [];

    for (const row of bqRows) {
      const hs = await checkHardstop().catch((e) => {
        console.warn('checkHardstop mid-loop falhou:', e.message);
        return { ok: true, gasto: 0, limite: 300 };
      });
      if (!hs.ok) {
        await logEvent({ jobId, evento: 'HARDSTOP_MID', detalhes: JSON.stringify({ parcial: outCsv.length }) });
        break;
      }

      const cpfRaw = row.cpf != null ? String(row.cpf).replace(/\D/g, '') : '';
      if (!validaCpf(cpfRaw)) {
        await logEvent({
          jobId,
          leadId: String(row.nome || ''),
          evento: 'CPF_INVALIDO',
          detalhes: 'CPF com dígitos inválidos ou ausente',
        });
        continue;
      }

      const nome = row.nome != null ? String(row.nome) : '';
      if (!nome.trim()) {
        await logEvent({ jobId, evento: 'NOME_AUSENTE', detalhes: 'Linha ignorada' });
        continue;
      }

      await bigdataEnrich({ cpf: cpfRaw, jobId });
      const osint = await enriqueceCelular({ cpf: cpfRaw, nome, jobId });

      const cpfM = mascaraCpf(cpfRaw);
      const leadCsv = {
        cpf_mascarado: cpfM,
        nome,
        uf: row.uf ?? '',
        municipio: row.municipio ?? '',
        categoria: row.categoria_potencial ?? '',
        motivo_indeferimento: row.motivo_indeferimento ?? '',
        data_indeferimento: row.data_indeferimento ?? '',
        score: row.score ?? '',
        ticket_estimado_brl: row.ticket_estimado_brl ?? '',
        celular: osint.celular ?? '',
        fonte_celular: osint.fonte ?? '',
        confianca_celular: osint.confianca ?? '',
        email: '',
      };
      outCsv.push(leadCsv);

      finalRows.push({
        job_id: jobId,
        lead_id: `${cpfM}-${nome.slice(0, 24)}`,
        cpf_mascarado: cpfM,
        nome,
        uf: row.uf ?? '',
        municipio: row.municipio ?? '',
        categoria: String(row.categoria_potencial ?? ''),
        celular: osint.celular ?? '',
        fonte_celular: osint.fonte ?? '',
        confianca_celular: osint.confianca ?? '',
        email: '',
        score: Number(row.score) || null,
        ticket_estimado_brl: Number(row.ticket_estimado_brl) || null,
        status: 'GERADO',
        oab_solicitante: oab,
        csv_url: '',
        gerado_em: new Date(),
      });
    }

    if (!outCsv.length) {
      await logEvent({ jobId, evento: 'SEM_LEADS', detalhes: JSON.stringify({ linhas_view: bqRows.length }) });
      await enviarMensagem(
        chatId,
        'Nenhuma linha elegível foi produzida (view vazia, CPF inválido ou dados insuficientes). Nenhum dado foi inventado.'
      ).catch((e) => console.warn('enviarMensagem falhou (sem_leads):', e.message));
      return;
    }

    const { url, filename } = await geraCsvLgpd({ leads: outCsv, jobId, oab });

    try {
      const tFinal = bq.dataset('tbr_leads_prev').table('leads_finalizados');
      const withUrl = finalRows.map((r) => ({ ...r, csv_url: url }));
      await tFinal.insert(withUrl);
    } catch (e) {
      await logEvent({
        jobId,
        evento: 'MOTIVO_FALHA',
        detalhes: JSON.stringify({ etapa: 'BQ_INSERT_FINAL', erro: String(e?.message || e) }),
      });
    }

    await logEvent({ jobId, evento: 'CSV_GERADO', detalhes: JSON.stringify({ n: outCsv.length, filename }) });
    await enviarMensagem(
      chatId,
      `Processamento concluído. Foram emitidas <b>${outCsv.length}</b> linhas no CSV (CPF mascarado). OAB registrada: <code>${oab}</code>.`
    ).catch((e) => console.warn('enviarMensagem falhou (conclusão):', e.message));
    await enviarDocumentoUrl(chatId, url, `${jobId}.csv`).catch(async (e) => {
      await logEvent({
        jobId,
        evento: 'TELEGRAM_DOC_FALHOU',
        detalhes: String(e?.message || e),
      });
    });
  }
);
