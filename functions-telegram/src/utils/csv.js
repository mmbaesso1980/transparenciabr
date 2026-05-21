import { stringify } from 'csv-stringify/sync';
import { Storage } from '@google-cloud/storage';

const storage = new Storage();

const HEADER = `# TransparênciaBR — Sistema de Identificação de Potenciais Direitos Previdenciários
# Base legal: LGPD art. 7º IX (legítimo interesse) | art. 11 II g (saúde quando aplicável)
# Diagnóstico final cabe exclusivamente ao advogado responsável.
# Descadastro: contato@transparenciabr.com.br`;

const BUCKET = process.env.LEADS_BUCKET || 'transparenciabr-leads';

/**
 * Gera CSV com cabeçalho LGPD, grava no bucket e retorna URL assinada (24h).
 */
export async function geraCsvLgpd({ leads, jobId, oab }) {
  const ts = new Date().toISOString();
  const headerCompleto = `${HEADER}\n# Gerado em: ${ts} | Job: ${jobId} | Solicitante OAB: ${oab}\n`;
  const rows = stringify(leads, { header: true });
  const body = headerCompleto + rows;
  const filename = `leads/${jobId}.csv`;
  await storage.bucket(BUCKET).file(filename).save(body, { contentType: 'text/csv; charset=utf-8' });
  const [url] = await storage.bucket(BUCKET).file(filename).getSignedUrl({
    action: 'read',
    expires: Date.now() + 24 * 60 * 60 * 1000,
  });
  return { filename, url };
}
