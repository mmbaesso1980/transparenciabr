/**
 * dlqAlertFn — alerta Telegram quando mensagens do pipeline caem na DLQ Pub/Sub.
 *
 * Deploy no mesmo projeto GCP em que existe o tópico `DOSSIE_V1_DLQ_TOPIC`.
 * Variáveis: TELEGRAM_BOT_TOKEN, TELEGRAM_DLQ_CHAT_ID (default vazio), DOSSIE_V1_DLQ_TOPIC.
 */
'use strict';

const functions = require('firebase-functions/v1');
const axios = require('axios');

const REGION = 'southamerica-east1';
const DLQ_TOPIC = process.env.DOSSIE_V1_DLQ_TOPIC || 'dossie-v1-pipeline-dlq';

function decodePayload(message) {
  if (!message || !message.data) return {};
  try {
    const raw = Buffer.from(message.data, 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return { _raw: String(message.data) };
  }
}

exports.dlqAlertFn = functions
  .region(REGION)
  .pubsub.topic(DLQ_TOPIC)
  .onPublish(async (message) => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chat = process.env.TELEGRAM_DLQ_CHAT_ID;
    if (!token || !chat) {
      functions.logger.warn('dlqAlertFn: TELEGRAM_BOT_TOKEN ou TELEGRAM_DLQ_CHAT_ID ausente.');
      return null;
    }
    const payload = decodePayload(message);
    const text =
      `DLQ — Dossiê v1 pipeline\n` +
      `Tópico: ${DLQ_TOPIC}\n` +
      `Mensagem após esgotar tentativas de entrega (ver subscription dead_letter_policy).\n` +
      `\`\`\`json\n${JSON.stringify(payload, null, 2).slice(0, 3500)}\n\`\`\``;

    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chat,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      },
      { timeout: 15000 },
    );
    return null;
  });
