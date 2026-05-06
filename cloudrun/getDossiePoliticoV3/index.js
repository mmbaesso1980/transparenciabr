/**
 * getDossiePoliticoV3 — Cloud Run Function
 * v2.0 (05/05/2026) — adiciona BigQuery fan-out + Vertex Search
 *
 * Backends:
 *  - Vertex Search: 10 datastores tbr-fs2-* (politicos, ceap-bodes, ghosts, dossies, espectro,
 *    voting, malha-saude, transparency, neutrality, diarios-atos)
 *  - BigQuery: ceap_despesas (617k), emendas (32k), 4 views analiticas
 *
 * Custo:
 *  - Vertex Search Query: gratis ate 10k/mes
 *  - BigQuery: ~50MB scan por dossie => fracoes de centavo
 *
 * Env vars (Cloud Run):
 *  - VERTEX_PROJECT_ID=projeto-codex-br
 *  - BQ_PROJECT_ID=transparenciabr
 *
 * SA: queima-vertex@projeto-codex-br.iam.gserviceaccount.com
 *  (precisa ter roles/bigquery.dataViewer + bigquery.jobUser no projeto transparenciabr)
 */

const functions = require('@google-cloud/functions-framework');
const { DiscoveryEngineServiceClient } = require('@google-cloud/discoveryengine').v1;
const { BigQuery } = require('@google-cloud/bigquery');

const VERTEX_PROJECT = process.env.VERTEX_PROJECT_ID || 'projeto-codex-br';
const BQ_PROJECT = process.env.BQ_PROJECT_ID || 'transparenciabr';
const LOCATION = 'global';

const DATASTORES = [
  'tbr-fs2-politicos',
  'tbr-fs2-alertas-bodes',
  'tbr-fs2-ghosts',
  'tbr-fs2-dossies',
  'tbr-fs2-espectro',
  'tbr-fs2-voting',
  'tbr-fs2-malha-saude',
  'tbr-fs2-transparency',
  'tbr-fs2-neutrality',
  'tbr-fs2-diarios-atos',
];

const searchClient = new DiscoveryEngineServiceClient();
const bq = new BigQuery({ projectId: BQ_PROJECT });

async function searchDatastore(datastoreId, query, pageSize = 5) {
  const servingConfig = `projects/${VERTEX_PROJECT}/locations/${LOCATION}/collections/default_collection/dataStores/${datastoreId}/servingConfigs/default_search`;
  try {
    const [response] = await searchClient.search({
      servingConfig,
      query,
      pageSize,
      queryExpansionSpec: { condition: 'AUTO' },
      spellCorrectionSpec: { mode: 'AUTO' },
    });
    return (response || []).map(r => ({
      datastore: datastoreId,
      id: r.id,
      data: r.document?.structData || {},
    }));
  } catch (err) {
    return [{ datastore: datastoreId, error: err.message }];
  }
}

async function bqQuery(sql, params = {}) {
  try {
    const [rows] = await bq.query({ query: sql, params, location: 'US' });
    return rows;
  } catch (err) {
    return { error: err.message };
  }
}

async function getCeapAggregates(politicoNome) {
  const sql = `
    SELECT
      parlamentar_id,
      autor AS nome,
      COUNT(*) AS n_documentos,
      ROUND(SUM(IFNULL(valor_documento,0)), 2) AS total_gasto,
      ROUND(AVG(IFNULL(valor_documento,0)), 2) AS gasto_medio,
      ROUND(MAX(IFNULL(valor_documento,0)), 2) AS maior_gasto,
      MIN(data_emissao) AS primeira_despesa,
      MAX(data_emissao) AS ultima_despesa
    FROM \`${BQ_PROJECT}.transparenciabr.ceap_despesas\`
    WHERE LOWER(autor) LIKE LOWER(@nome)
    GROUP BY parlamentar_id, autor
    ORDER BY total_gasto DESC
    LIMIT 5
  `;
  return bqQuery(sql, { nome: `%${politicoNome}%` });
}

async function getEmendasAggregates(politicoNome) {
  const sql = `
    SELECT
      autor AS nome,
      COUNT(*) AS n_emendas,
      ROUND(SUM(IFNULL(valorEmpenhado,0)), 2) AS total_empenhado,
      ROUND(SUM(IFNULL(valorPago,0)), 2) AS total_pago,
      COUNT(DISTINCT municipio) AS municipios_atendidos,
      COUNT(DISTINCT estado) AS estados_atendidos
    FROM \`${BQ_PROJECT}.transparenciabr.emendas\`
    WHERE LOWER(autor) LIKE LOWER(@nome)
    GROUP BY autor
    ORDER BY total_empenhado DESC
    LIMIT 5
  `;
  return bqQuery(sql, { nome: `%${politicoNome}%` });
}

async function getBenfordAudit(politicoNome) {
  const sql = `
    SELECT *
    FROM \`${BQ_PROJECT}.transparenciabr.vw_benford_ceap_audit\`
    WHERE parlamentar_id IN (
      SELECT DISTINCT parlamentar_id
      FROM \`${BQ_PROJECT}.transparenciabr.ceap_despesas\`
      WHERE LOWER(autor) LIKE LOWER(@nome)
      LIMIT 5
    )
    LIMIT 50
  `;
  return bqQuery(sql, { nome: `%${politicoNome}%` });
}

async function getZScoreOutliers(politicoNome) {
  const sql = `
    WITH alvos AS (
      SELECT DISTINCT parlamentar_id
      FROM \`${BQ_PROJECT}.transparenciabr.ceap_despesas\`
      WHERE LOWER(autor) LIKE LOWER(@nome)
      LIMIT 5
    )
    SELECT *
    FROM \`${BQ_PROJECT}.transparenciabr.vw_ceap_zscore_roll\`
    WHERE parlamentar_id IN (SELECT parlamentar_id FROM alvos)
      AND ABS(IFNULL(zscore_roll, 0)) > 2
    ORDER BY ABS(zscore_roll) DESC
    LIMIT 30
  `;
  return bqQuery(sql, { nome: `%${politicoNome}%` });
}

functions.http('getDossiePoliticoV3', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).send('');

  const t0 = Date.now();
  const query = (req.query.q || req.body?.q || '').toString().trim();
  if (!query) return res.status(400).json({ error: 'param q obrigatorio' });

  // Fan-out paralelo: 10 datastores Vertex + 4 queries BigQuery
  const [vertexResults, ceap, emendas, benford, zscore] = await Promise.all([
    Promise.all(DATASTORES.map(ds => searchDatastore(ds, query))),
    getCeapAggregates(query),
    getEmendasAggregates(query),
    getBenfordAudit(query),
    getZScoreOutliers(query),
  ]);

  const vertex_evidencias = vertexResults.flat().filter(r => !r.error);
  const vertex_erros = vertexResults.flat().filter(r => r.error);

  res.status(200).json({
    query,
    timing_ms: Date.now() - t0,
    vertex: {
      total: vertex_evidencias.length,
      evidencias: vertex_evidencias,
      erros: vertex_erros,
    },
    bigquery: {
      ceap_despesas: ceap,
      emendas: emendas,
      benford_audit: benford,
      zscore_outliers: zscore,
    },
    disclaimer: 'Toda nota e suspeita ate prova contraria. Indicios quantitativos derivados de dados publicos — nao configuram ilicito nem substituem apuracao oficial.',
  });
});
