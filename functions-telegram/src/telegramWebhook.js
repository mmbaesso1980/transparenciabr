import { onRequest } from 'firebase-functions/v2/https';
import { PubSub } from '@google-cloud/pubsub';
import { getSecret } from './utils/secrets.js';
import { checkHardstop } from './utils/hardstop.js';
import { logEvent } from './utils/audit.js';
import { enviarMensagem } from './utils/telegram.js';

const pubsub = new PubSub();
const TOPIC = process.env.LEAD_PIPELINE_TOPIC || 'lead-pipeline-jobs';

const CATEGORIAS = [
  'PCD_LC142',
  'BPC_LOAS',
  'PESCADOR_DEFESO',
  'RIBEIRINHO',
  'INDIGENA',
  'QUILOMBOLA',
  'GARIMPEIRO',
  'EX_COMBATENTE',
  'ANISTIADO_POLITICO',
  'PROFESSOR',
  'ATIV_ESPECIAL',
  'PENSAO_MORTE',
  'AUX_RECLUSAO',
  'SAL_MATERN_RURAL',
  'AUX_ACIDENTE',
  'ESP_SERV_PUBLICO',
  'REV_VIDA_TODA',
  'SAL_FAMILIA',
  'SEG_ESPECIAL_RURAL',
  'REVISAO_BURACO_NEGRO',
];

async function parseAllowedChats() {
  const raw = await getSecret('ALLOWED_CHAT_IDS');
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function randomJobId(prefix = 'job') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function publicarJob(payload) {
  const topic = pubsub.topic(TOPIC);
  const dataBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  await topic.publishMessage({ data: dataBuffer });
}

export const telegramWebhook = onRequest(
  { region: 'us-east1', cors: false, invoker: 'public', memory: '512MiB', timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Método não permitido.');
      return;
    }
    const expectedSecret = await getSecret('TELEGRAM_WEBHOOK_SECRET');
    const got = req.get('X-Telegram-Bot-Api-Secret-Token') || '';
    if (!expectedSecret || got !== expectedSecret) {
      res.status(401).send('Não autorizado.');
      return;
    }

    const update = req.body;
    const msg = update?.message;
    const chatId = msg?.chat?.id != null ? String(msg.chat.id) : null;
    const textRaw = msg?.text?.trim() || '';

    if (!chatId) {
      res.status(200).send('OK');
      return;
    }

    const allowed = await parseAllowedChats();
    if (allowed.length && !allowed.includes(chatId)) {
      res.status(200).send('OK');
      return;
    }

    const reply = async (t) => {
      try {
        await enviarMensagem(chatId, t);
      } catch (e) {
        console.error('Falha ao responder Telegram:', e.message);
      }
    };

    const parts = textRaw.split(/\s+/).filter(Boolean);
    const cmd = (parts[0] || '').toLowerCase();

    try {
      if (cmd === '/start') {
        await reply(
          '<b>TransparênciaBR — motor AURORA</b>\n' +
            'Canal de comando operacional. Utilize /help para a lista de comandos.\n' +
            'Registramos acessos para fins de auditoria (LGPD).'
        );
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/help') {
        await reply(
          'Comandos disponíveis:\n' +
            '/start — mensagem de boas-vindas\n' +
            '/status — teto de custo diário (BigData / OSINT)\n' +
            '/report &lt;OAB&gt; — fila de extração de leads (OAB obrigatória)\n' +
            '/uf &lt;sigla&gt; — define filtro UF para o próximo /report\n' +
            '/categoria &lt;código&gt; — restringe categoria (veja lista em /categoria)\n' +
            '/jobs — lembrete de acompanhamento via Cloud Logging\n' +
            '/cancel &lt;job_id&gt; — cancelamento best-effort (MVP)\n' +
            '/help — esta mensagem'
        );
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/status') {
        const hs = await checkHardstop().catch((e) => {
          console.warn('checkHardstop falhou (/status):', e.message);
          return { ok: true, gasto: 0, limite: 300 };
        });
        await reply(
          `<b>Status do teto diário</b>\n` +
            `Gasto estimado hoje: R$ ${Number(hs.gasto || 0).toFixed(2)}\n` +
            `Limite: R$ ${Number(hs.limite || 300).toFixed(2)}\n` +
            `Novos jobs: ${hs.ok ? 'permitidos' : 'bloqueados até o próximo dia (America/Sao_Paulo)'}`
        );
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/categoria' && !parts[1]) {
        await reply(`Categorias aceitas (ex.: <code>/categoria PCD_LC142</code>):\n${CATEGORIAS.join(', ')}`);
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/report') {
        const oab = parts.slice(1).join(' ').trim();
        if (!oab) {
          await reply(
            'Para enfileirar um relatório, informe a OAB do solicitante após /report. Exemplo: <code>/report SP123456</code>.'
          );
          res.status(200).send('OK');
          return;
        }
        const hs = await checkHardstop();
        if (!hs.ok) {
          await reply(
            'O teto diário de custo foi atingido. Nenhum novo job será enfileirado até a virada do dia em America/Sao_Paulo.'
          );
          res.status(200).send('OK');
          return;
        }
        const jobId = randomJobId('tg');
        const payload = {
          job_id: jobId,
          comando: '/report',
          args: {
            municipios: ['Valinhos', 'Vitória', 'Belém'],
            limite_por_municipio: 50,
            categorias: 'all',
          },
          chat_id: chatId,
          oab,
          timestamp: new Date().toISOString(),
        };
        await publicarJob(payload);
        await logEvent({ jobId, evento: 'JOB_ENFILEIRADO', detalhes: JSON.stringify({ comando: '/report', oab }) });
        await reply(
          `Job <code>${jobId}</code> enfileirado. O motor AURORA processará assim que houver capacidade. ` +
            'Você receberá o CSV por este chat quando concluído.'
        );
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/uf' && parts[1]) {
        await reply(
          `Filtro UF anotado: <b>${parts[1].toUpperCase()}</b>. ` +
            'Na versão atual, passe municípios e UF via job Pub/Sub ou amplie o parser de /report conforme necessidade operacional.'
        );
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/jobs') {
        await reply(
          'Acompanhe execuções em tempo real pelo Cloud Logging (funções <code>telegramWebhook</code> e <code>pipelineWorker</code>, região us-east1).'
        );
        res.status(200).send('OK');
        return;
      }

      if (cmd === '/cancel' && parts[1]) {
        await reply(
          `Solicitação de cancelamento registrada para <code>${parts[1]}</code>. ` +
            'O MVP não interrompe workers em andamento; trate como best-effort até a próxima versão.'
        );
        res.status(200).send('OK');
        return;
      }

      await reply('Comando não reconhecido. Envie /help para instruções.');
      res.status(200).send('OK');
    } catch (e) {
      console.error('telegramWebhook unhandled error:', { message: e.message, stack: e.stack, cmd });
      res.status(500).send('Erro interno.');
    }
  }
);
