/**
 * Deploy forensic views to BigQuery — TransparênciaBR
 * Runs each CREATE OR REPLACE VIEW statement against BigQuery US location.
 */
import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync } from 'fs';

const bq = new BigQuery({ projectId: 'transparenciabr', location: 'US' });

const sql = readFileSync('/home/ubuntu/transparenciabr/bigquery_forensic_views.sql', 'utf8');

// Split by CREATE OR REPLACE VIEW
const statements = sql
  .split(/(?=CREATE OR REPLACE VIEW)/)
  .map(s => s.trim())
  .filter(s => s.startsWith('CREATE OR REPLACE VIEW'));

console.log(`Found ${statements.length} view statements to deploy.\n`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const viewName = stmt.match(/`([^`]+)`/)?.[1] || `view_${i}`;
  console.log(`[${i + 1}/${statements.length}] Deploying: ${viewName}`);
  
  try {
    await bq.query({ query: stmt, location: 'US' });
    console.log(`  ✓ SUCCESS\n`);
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}\n`);
  }
}

console.log('Done. All forensic views deployed.');
