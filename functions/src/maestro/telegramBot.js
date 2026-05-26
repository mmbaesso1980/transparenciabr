/**
 * telegramBot.js — AURORA · MELHORIA 2
 * Bot Telegram bidirecional para o Comandante Baesso.
 *
 * Endpoint público: telegramWebhook (HTTPS Function)
 * Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<region>-<project>.cloudfunctions.net/telegramWebhook
 *
 * Comandos:
 *   /dossie <slug>     → enfileira mensagem Pub/Sub dossie-v1-pipeline
 *   /status            → executa agent_self_healer e devolve relatório
 *   /leads [uf]        → consulta Firestore leads/{uf} e devolve top 10
 *   /skill <nome>      → ativa skill no maestro (skill_dossie etc)
 *   /help              → lista comandos
 *
 * Segurança: só responde ao chat_id 6483072695 (Comandante Baesso).
 */
const functions = require('firebase-functions');
const admin     = require('firebase-admin');
const {PubSub}  = require('@google-cloud/pubsub');
const axios     = require('axios');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const pubsub = new PubSub({projectId: 'projeto-codex-br'});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || functions.config()?.telegram?.token;
const COMANDANTE_CHAT_ID = '6483072695';
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text, opts = {}) {
  return axios.post(`${TG_API}/sendMessage`, {
    chat_id: chatId, text, parse_mode: 'Markdown', ...opts,
  });
}

async function sendDocument(chatId, fileUrl, caption) {
  return axios.post(`${TG_API}/sendDocument`, {
    chat_id: chatId, document: fileUrl, caption, parse_mode: 'Markdown',
  });
}

async function cmdDossie(chatId, args) {
  const slug = args[0];
  if (!slug) return sendMessage(chatId, '⚠️  Uso: `/dossie <slug>`\nExemplo: `/dossie erika-hilton`');
  const dossieId = `${slug}-tg-${Date.now()}`;
  await pubsub.topic('dossie-v1-pipeline').publishMessage({
    json: {slug, versao: '1.1', origem: 'telegram', dossie_id: dossieId},
    attributes: {dossie_id: dossieId, comandante: 'manusalt13@gmail.com'},
  });
  await sendMessage(chatId, `🚀 Dossiê *${slug}* enfileirado.\nID: \`${dossieId}\`\n⏱️ ETA ~9min.\nEnviarei o PDF quando pronto.`);
  // Registra para callback do storage trigger
  await db.collection('telegram_jobs').doc(dossieId).set({
    chat_id: chatId, slug, status: 'queued', created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function cmdStatus(chatId) {
  await sendMessage(chatId, '🩺 Executando self-healer…');
  // Dispara via Cloud Run Job ou Pub/Sub topic agent-self-healer
  try {
    await pubsub.topic('agent-self-healer').publishMessage({json: {triggered_by: 'telegram'}});
    await sendMessage(chatId, '✅ Self-healer disparado. Relatório virá em <60s.');
  } catch (e) {
    await sendMessage(chatId, `❌ Falha: ${e.message}`);
  }
}

async function cmdLeads(chatId, args) {
  const uf = (args[0] || 'ES').toUpperCase();
  const snap = await db.collection('leads_inss').where('uf', '==', uf).orderBy('score', 'desc').limit(10).get();
  if (snap.empty) return sendMessage(chatId, `Nenhum lead em ${uf}.`);
  const lines = snap.docs.map((d, i) => {
    const x = d.data();
    return `${i+1}. *${x.nome || '?'}* · score ${x.score?.toFixed(1) || '?'} · ${x.municipio || ''}`;
  });
  await sendMessage(chatId, `📋 *Top 10 leads ${uf}:*\n\n${lines.join('\n')}`);
}

async function cmdSkill(chatId, args) {
  const nome = args[0];
  if (!nome) return sendMessage(chatId, '⚠️  Uso: `/skill <nome>`');
  // Cria documento maestro_intents — maestroChat polling acionará
  await db.collection('maestro_intents').add({
    skill: nome, requested_by: 'telegram', chat_id: chatId,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  await sendMessage(chatId, `🎯 Skill *${nome}* solicitada ao Maestro.`);
}

async function cmdHelp(chatId) {
  await sendMessage(chatId, [
    '🤖 *AURORA Bot · Comandos*',
    '',
    '`/dossie <slug>` — gera dossiê forense',
    '`/status` — saúde da plataforma',
    '`/leads [uf]` — top 10 leads (default ES)',
    '`/skill <nome>` — ativa skill no Maestro',
    '`/help` — esta lista',
  ].join('\n'));
}

exports.telegramWebhook = functions.region('southamerica-east1').https.onRequest(async (req, res) => {
  try {
    const upd = req.body;
    const msg = upd.message || upd.edited_message;
    if (!msg || !msg.text) return res.status(200).send('ok');

    const chatId = String(msg.chat.id);
    if (chatId !== COMANDANTE_CHAT_ID) {
      await sendMessage(chatId, '🔒 Acesso restrito.');
      return res.status(200).send('ok');
    }

    const [cmd, ...args] = msg.text.trim().split(/\s+/);
    switch (cmd) {
      case '/dossie':  await cmdDossie(chatId, args);  break;
      case '/status':  await cmdStatus(chatId);        break;
      case '/leads':   await cmdLeads(chatId, args);   break;
      case '/skill':   await cmdSkill(chatId, args);   break;
      case '/start':
      case '/help':    await cmdHelp(chatId);          break;
      default:
        await sendMessage(chatId, `Não reconheci \`${cmd}\`. /help`);
    }
    res.status(200).send('ok');
  } catch (e) {
    console.error('telegramWebhook err', e);
    res.status(200).send('ok'); // sempre 200 pro Telegram não re-tentar
  }
});

// Trigger: quando PDF aparece no bucket, envia ao chat solicitante
exports.notifyTelegramOnPdf = functions
  .region('southamerica-east1')
  .storage.bucket('datalake-tbr-clean')
  .object().onFinalize(async (obj) => {
    if (!obj.name?.startsWith('dossies_v1/') || !obj.name.endsWith('.pdf')) return;
    const fname = obj.name.split('/').pop();
    const slug = fname.split('-')[0];
    const jobs = await db.collection('telegram_jobs')
      .where('slug', '==', slug).where('status', '==', 'queued').limit(1).get();
    if (jobs.empty) return;
    const job = jobs.docs[0];
    const url = `https://storage.googleapis.com/${obj.bucket}/${obj.name}`;
    await sendDocument(job.data().chat_id, url, `✅ Dossiê *${slug}* pronto.`);
    await job.ref.update({status: 'delivered', delivered_at: admin.firestore.FieldValue.serverTimestamp()});
  });
