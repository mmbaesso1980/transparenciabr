import axios from 'axios';
import { getSecret } from './secrets.js';

export async function enviarMensagem(chatId, text) {
  const token = await getSecret('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN ausente');
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

export async function enviarDocumentoUrl(chatId, url, filename) {
  const token = await getSecret('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN ausente');
  await axios.post(`https://api.telegram.org/bot${token}/sendDocument`, {
    chat_id: chatId,
    document: url,
    caption: 'Relatório de leads (CSV). O diagnóstico final cabe ao advogado responsável.',
    filename: filename || 'leads.csv',
  });
}
