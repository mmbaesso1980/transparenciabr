/**
 * @fileoverview OpenLineage event emitter for transparenciabr ingestion runs.
 *
 * Emits OpenLineage RunEvent JSON to the configured OPENLINEAGE_URL endpoint.
 * If OPENLINEAGE_URL is not set, events are written as structured JSON to stdout
 * (useful for Cloud Logging ingestion and development).
 *
 * OpenLineage spec: https://openlineage.io/spec/
 *
 * Job naming convention:
 *   namespace : "transparenciabr"
 *   name      : "ingest.{apiId}"
 *
 * Environment variables:
 *   OPENLINEAGE_URL      – HTTP endpoint for OpenLineage transport (optional)
 *   GCP_PROJECT_ID       – used to build dataset URIs
 *   DATALAKE_BUCKET_RAW  – GCS bucket name for output dataset URIs
 *   BQ_DATASET           – BigQuery dataset name for external table URIs (optional)
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const NAMESPACE = 'transparenciabr';
const PRODUCER = 'https://github.com/mmbaesso1980/transparenciabr';

// ─── Logging ──────────────────────────────────────────────────────────────────

/**
 * @param {'DEBUG'|'INFO'|'WARNING'|'ERROR'} severity
 * @param {string} message
 * @param {Record<string,unknown>} [payload]
 */
function log(severity, message, payload = {}) {
  console.log(
    JSON.stringify({ severity, message, timestamp: new Date().toISOString(), ...payload }),
  );
}

// ─── Transport ────────────────────────────────────────────────────────────────

/**
 * Deliver an OpenLineage event object.
 * @param {Record<string,unknown>} event
 * @returns {Promise<void>}
 */
async function transport(event) {
  const url = process.env.OPENLINEAGE_URL;

  if (!url) {
    // Stdout transport (Cloud Logging picks this up)
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'OpenLineage event',
        openlineage: event,
        timestamp: new Date().toISOString(),
      }),
    );
    return;
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });

    if (!resp.ok) {
      log('WARNING', 'OpenLineage transport returned non-2xx', {
        status: resp.status,
        url,
      });
    }
  } catch (err) {
    // OpenLineage transport failures must never break ingestion
    log('WARNING', 'OpenLineage transport error (non-fatal)', {
      error: err.message,
      url,
    });
  }
}

// ─── Dataset URI builders ─────────────────────────────────────────────────────

/**
 * Build a GCS dataset URI in OpenLineage format.
 * @param {string} gcsPrefix – GCS object prefix (e.g. raw/source=X/dataset=Y/...)
 * @returns {{ namespace:string, name:string }}
 */
function gcsDatasetUri(gcsPrefix) {
  const bucket = process.env.DATALAKE_BUCKET_RAW ?? 'datalake-raw';
  return {
    namespace: `gs://${bucket}`,
    name: gcsPrefix,
  };
}

/**
 * Build a BigQuery external table URI.
 * @param {string} apiId
 * @returns {{ namespace:string, name:string }}
 */
function bqDatasetUri(apiId) {
  const project = process.env.GCP_PROJECT_ID ?? 'unknown-project';
  const dataset = process.env.BQ_DATASET ?? 'raw_external';
  return {
    namespace: `bigquery://${project}`,
    name: `${dataset}.${apiId.replace(/[^a-zA-Z0-9_]/g, '_')}`,
  };
}

// ─── Event builders ───────────────────────────────────────────────────────────

/**
 * @param {string} apiId
 * @returns {{ namespace:string, name:string }}
 */
function jobRef(apiId) {
  return {
    namespace: NAMESPACE,
    name: `ingest.${apiId}`,
  };
}

/**
 * @param {string} runId
 * @returns {{ runId:string }}
 */
function runRef(runId) {
  return { runId };
}

// ─── Exported emitters ────────────────────────────────────────────────────────

/**
 * Emit an OpenLineage START event at the beginning of an ingestion run.
 *
 * @param {{ runId:string, apiId:string, gcsPrefix:string }} params
 * @returns {Promise<void>}
 */
export async function emitRunStart({ runId, apiId, gcsPrefix }) {
  if (!runId || !apiId) {
    log('WARNING', 'emitRunStart called with missing runId or apiId — skipping');
    return;
  }

  const event = {
    eventType: 'START',
    eventTime: new Date().toISOString(),
    producer: PRODUCER,
    schemaURL: 'https://openlineage.io/spec/1-0-5/OpenLineage.json',
    run: runRef(runId),
    job: jobRef(apiId),
    inputs: [],
    outputs: [
      {
        ...gcsDatasetUri(gcsPrefix),
        facets: {
          dataSource: {
            _producer: PRODUCER,
            _schemaURL:
              'https://openlineage.io/spec/facets/1-0-0/DatasourceDatasetFacet.json',
            name: `gs://${process.env.DATALAKE_BUCKET_RAW ?? 'datalake-raw'}`,
            uri: `gs://${process.env.DATALAKE_BUCKET_RAW ?? 'datalake-raw'}/${gcsPrefix}`,
          },
        },
      },
    ],
  };

  await transport(event);

  log('DEBUG', 'OpenLineage START emitted', { run_id: runId, api_id: apiId });
}

/**
 * Emit an OpenLineage COMPLETE event at the end of a successful ingestion run.
 *
 * @param {{ runId:string, apiId:string, recordsWritten:number, bytesWritten:number, manifestUri:string, gcsPrefix?:string }} params
 * @returns {Promise<void>}
 */
export async function emitRunComplete({
  runId,
  apiId,
  recordsWritten,
  bytesWritten,
  manifestUri,
  gcsPrefix = '',
}) {
  if (!runId || !apiId) {
    log('WARNING', 'emitRunComplete called with missing runId or apiId — skipping');
    return;
  }

  const event = {
    eventType: 'COMPLETE',
    eventTime: new Date().toISOString(),
    producer: PRODUCER,
    schemaURL: 'https://openlineage.io/spec/1-0-5/OpenLineage.json',
    run: {
      ...runRef(runId),
      facets: {
        nominalTime: {
          _producer: PRODUCER,
          _schemaURL:
            'https://openlineage.io/spec/facets/1-0-0/NominalTimeRunFacet.json',
          nominalStartTime: new Date().toISOString(),
        },
      },
    },
    job: jobRef(apiId),
    inputs: [],
    outputs: [
      {
        ...gcsDatasetUri(gcsPrefix),
        facets: {
          outputStatistics: {
            _producer: PRODUCER,
            _schemaURL:
              'https://openlineage.io/spec/facets/1-0-2/OutputStatisticsOutputDatasetFacet.json',
            rowCount: recordsWritten,
            size: bytesWritten,
          },
          dataSource: {
            _producer: PRODUCER,
            _schemaURL:
              'https://openlineage.io/spec/facets/1-0-0/DatasourceDatasetFacet.json',
            name: `gs://${process.env.DATALAKE_BUCKET_RAW ?? 'datalake-raw'}`,
            uri: manifestUri,
          },
        },
      },
      {
        ...bqDatasetUri(apiId),
        facets: {},
      },
    ],
  };

  await transport(event);

  log('DEBUG', 'OpenLineage COMPLETE emitted', {
    run_id: runId,
    api_id: apiId,
    records_written: recordsWritten,
    bytes_written: bytesWritten,
  });
}

/**
 * Emit an OpenLineage FAIL event.
 *
 * @param {{ runId:string, apiId:string, error:string }} params
 * @returns {Promise<void>}
 */
export async function emitRunFail({ runId, apiId, error }) {
  if (!runId || !apiId) return;

  const event = {
    eventType: 'FAIL',
    eventTime: new Date().toISOString(),
    producer: PRODUCER,
    schemaURL: 'https://openlineage.io/spec/1-0-5/OpenLineage.json',
    run: runRef(runId),
    job: jobRef(apiId),
    inputs: [],
    outputs: [],
    runFacets: {
      errorMessage: {
        _producer: PRODUCER,
        _schemaURL:
          'https://openlineage.io/spec/facets/1-0-0/ErrorMessageRunFacet.json',
        message: error,
        programmingLanguage: 'javascript',
      },
    },
  };

  await transport(event);
  log('DEBUG', 'OpenLineage FAIL emitted', { run_id: runId, api_id: apiId, error });
}
