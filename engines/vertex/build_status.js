#!/usr/bin/env node
/**
 * BUILD STATUS — agrega métricas dos motores e ingestão e publica JSON público.
 *
 * Output:
 *   gs://datalake-tbr-clean/dashboard/sprint_status.json (públicoLeitura)
 *
 * Lido por: frontend/public/sprint.html (painel mobile)
 *
 * Roda a cada 5min via cron na VM.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BUCKET_RAW = 'datalake-tbr-raw';
const BUCKET_CLEAN = 'datalake-tbr-clean';

function gsCat(uri) {
  try { return execSync(`gsutil cat "${uri}" 2>/dev/null`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }); }
  catch { return null; }
}
function gsLs(prefix) {
  try { return execSync(`gsutil ls "gs://${prefix}" 2>/dev/null`, { encoding: 'utf-8' }).split('\n').filter(Boolean); }
  catch { return []; }
}
function gsDu(prefix) {
  try {
    const out = execSync(`gsutil du -s "gs://${prefix}" 2>/dev/null`, { encoding: 'utf-8' });
    const m = out.match(/^(\d+)/);
    return m ? parseInt(m[1]) : 0;
  } catch { return 0; }
}
function countNdjsonLines(prefix) {
  try {
    const out = execSync(`gsutil cat "gs://${prefix}*.ndjson" 2>/dev/null | wc -l`, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
    return parseInt(out.trim()) || 0;
  } catch { return 0; }
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

const today = new Date().toISOString().slice(0, 10);

// ─── INGESTÃO ───
const ingestao = {
  ceap: {},
  emendas_pix: {},
  funcionarios_camara: 0,
  servidores_senado: 0,
  ceaps_senado: {},
};
for (const year of ['2026', '2025', '2024', '2023', '2022', '2021', '2020']) {
  ingestao.ceap[year] = { bytes: gsDu(`${BUCKET_CLEAN}/ceap/year=${year}/`) };
  ingestao.emendas_pix[year] = { bytes: gsDu(`${BUCKET_CLEAN}/emendas_pix/year=${year}/`) };
  ingestao.ceaps_senado[year] = { bytes: gsDu(`${BUCKET_CLEAN}/ceaps_senado/year=${year}/`) };
}
ingestao.funcionarios_camara = gsDu(`${BUCKET_CLEAN}/funcionarios_camara/`);
ingestao.servidores_senado = gsDu(`${BUCKET_CLEAN}/servidores_senado/`);

// ─── FORENSES ───
function loadSummary(prefix) {
  const files = gsLs(prefix);
  if (files.length === 0) return null;
  const latest = files.sort().reverse()[0];
  const sumUri = `${latest.replace(/\/$/, '')}/summary.json`;
  const txt = gsCat(sumUri);
  return txt ? JSON.parse(txt) : null;
}
const flavioSummary = loadSummary(`${BUCKET_CLEAN}/forensic/flavio/`);
const sangueSummary = loadSummary(`${BUCKET_CLEAN}/forensic/sangue_poder/`);
const vertexSummary = (() => {
  const dirs = gsLs(`${BUCKET_CLEAN}/vertex/ceap_classified/year=2025/`);
  if (dirs.length === 0) return null;
  const latest = dirs.sort().reverse()[0];
  const txt = gsCat(`${latest.replace(/\/$/, '')}/summary.json`);
  return txt ? JSON.parse(txt) : null;
})();

// ─── STATUS ───
const status = {
  generated_at: new Date().toISOString(),
  generated_at_brt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
  ingestao: {
    ceap: Object.fromEntries(Object.entries(ingestao.ceap).map(([y, v]) => [y, { bytes: v.bytes, human: fmt(v.bytes) }])),
    emendas_pix: Object.fromEntries(Object.entries(ingestao.emendas_pix).map(([y, v]) => [y, { bytes: v.bytes, human: fmt(v.bytes) }])),
    ceaps_senado: Object.fromEntries(Object.entries(ingestao.ceaps_senado).map(([y, v]) => [y, { bytes: v.bytes, human: fmt(v.bytes) }])),
    funcionarios_camara: { bytes: ingestao.funcionarios_camara, human: fmt(ingestao.funcionarios_camara) },
    servidores_senado: { bytes: ingestao.servidores_senado, human: fmt(ingestao.servidores_senado) },
  },
  forenses: {
    flavio: flavioSummary,
    sangue_poder: sangueSummary,
  },
  vertex: {
    ceap_classified_2025: vertexSummary,
  },
  diretiva: 'Rota Vertex Calibrada — texto público no Vertex, inferência sensível local',
  buckets: {
    raw: fmt(gsDu(`${BUCKET_RAW}/`)),
    clean: fmt(gsDu(`${BUCKET_CLEAN}/`)),
  },
};

const local = '/tmp/sprint_status.json';
writeFileSync(local, JSON.stringify(status, null, 2));
execSync(`gsutil -q -h "Cache-Control:public,max-age=60" -h "Content-Type:application/json" cp "${local}" "gs://${BUCKET_CLEAN}/dashboard/sprint_status.json"`);
execSync(`gsutil -q acl ch -u AllUsers:R "gs://${BUCKET_CLEAN}/dashboard/sprint_status.json" || true`);
console.log(`✅ status publicado em https://storage.googleapis.com/${BUCKET_CLEAN}/dashboard/sprint_status.json`);
