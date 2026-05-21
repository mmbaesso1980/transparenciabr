import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery();

/**
 * Registro de auditoria em BigQuery (falha silenciosa no log apenas).
 * @param {{ jobId: string, leadId?: string, evento: string, detalhes?: string|object, custoBrl?: number }} p
 */
export async function logEvent({ jobId, leadId = '', evento, detalhes = '', custoBrl = 0 }) {
  const row = {
    job_id: jobId,
    lead_id: leadId,
    evento,
    detalhes: typeof detalhes === 'string' ? detalhes : JSON.stringify(detalhes),
    custo_estimado_brl: Number(custoBrl) || 0,
    timestamp: new Date(),
  };
  try {
    const table = bq.dataset('tbr_leads_prev').table('leads_enriquecidos_log');
    await table.insert([row]);
  } catch (e) {
    console.error('Audit log falhou:', e.message);
  }
}
