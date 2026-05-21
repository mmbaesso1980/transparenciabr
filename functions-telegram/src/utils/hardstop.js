import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery();
const LIMITE_DIARIO_BRL = 300.0;

/** Bloqueia novos custos quando a soma do dia (America/Sao_Paulo) atinge o teto. */
export async function checkHardstop() {
  const [rows] = await bq.query({
    query: `SELECT COALESCE(SUM(custo_estimado_brl), 0) AS gasto
            FROM \`transparenciabr.tbr_leads_prev.leads_enriquecidos_log\`
            WHERE DATE(timestamp, 'America/Sao_Paulo') = CURRENT_DATE('America/Sao_Paulo')`,
  });
  const gasto = Number(rows?.[0]?.gasto ?? 0);
  return { ok: gasto < LIMITE_DIARIO_BRL, gasto, limite: LIMITE_DIARIO_BRL };
}
