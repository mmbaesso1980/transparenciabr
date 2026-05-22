'use strict';

/** Localização do dataset `tbr_leads_prev` no BigQuery (jobs de query/load). */
function bqLocation() {
  return process.env.BQ_LOCATION || process.env.BQ_DATASET_LOCATION || 'southamerica-east1';
}

module.exports = { bqLocation };
