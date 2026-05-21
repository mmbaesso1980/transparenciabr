import { logEvent } from './audit.js';
import { getSecret } from './secrets.js';

/**
 * BigDataCorp: credenciais validadas; enriquecimento HTTP proprietário permanece no serviço principal (`functions/`).
 * Aqui apenas auditamos disponibilidade — sem fabricar contatos.
 */
export async function bigdataEnrich({ cpf, jobId }) {
  const tokenId = await getSecret('BIGDATA_TOKEN_ID');
  const access = await getSecret('BIGDATA_ACCESS_TOKEN');
  if (!tokenId || !access || access === 'PLACEHOLDER_RECONFIGURE' || tokenId === 'PLACEHOLDER_RECONFIGURE') {
    await logEvent({
      jobId,
      evento: 'BIGDATA_INDISPONIVEL',
      detalhes: JSON.stringify({ motivo: 'Credenciais ausentes ou placeholder' }),
    });
    return { ok: false, dados: null };
  }
  await logEvent({
    jobId,
    evento: 'BIGDATA_CREDENCIAIS_OK',
    detalhes: JSON.stringify({
      cpf_presente: !!cpf,
      nota: 'Chamada HTTP ao contrato BigData não duplicada neste pacote; usar leads existentes e OSINT.',
    }),
  });
  return { ok: true, dados: {} };
}
