#!/usr/bin/env node
/**
 * VERTEX CLASSIFIER — Taxonomia de notas CEAP via Gemini 2.5 Flash (BATCH).
 *
 * DIRETIVA SUPREMA RESPEITADA: "Rota Vertex Calibrada"
 *   - Vertex SÓ vê texto público (txtdescricao da CEAP, nome de fornecedor)
 *   - NUNCA recebe cruzamentos QSA × TSE × inferências de laranjagem
 *   - Inferências sensíveis ficam nos motores determinísticos locais (FLAVIO, SANGUE E PODER)
 *
 * Uso:
 *   node classify_ceap.js --year 2025 --max 5000 --dry-run
 *   node classify_ceap.js --year 2025 --batch-size 250
 *
 * Output:
 *   gs://datalake-tbr-clean/vertex/ceap_classified/year=YYYY/snapshot=DATE/parte-N.ndjson
 *
 * Custo estimado (Flash batch, R$ ≈ USD 5):
 *   ~3M notas CEAP histórico ≈ R$ 50–80 (vs R$ 600+ síncrono Pro)
 *
 * Modelo: publishers/google/models/gemini-2.5-pro (batch prediction; G.O.A.T. — mesmo motor do Líder Supremo)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------- CONFIG ----------
const PROJECT_ID = process.env.GCP_PROJECT_ID || 'transparenciabr';
const LOCATION = process.env.VERTEX_LOCATION || 'us-central1';
const MODEL = process.env.CEAP_VERTEX_CLASSIFY_MODEL || process.env.VERTEX_MODEL || 'gemini-2.5-pro';
const BUCKET_CLEAN = 'datalake-tbr-clean';
const SNAPSHOT_DATE = new Date().toISOString().slice(0, 10);
const TMP_DIR = '/tmp/tbr_vertex_classify';
if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

const TAXONOMY = [
  'TRANSPORTE_AEREO',
  'TRANSPORTE_TERRESTRE',
  'COMBUSTIVEL',
  'HOSPEDAGEM',
  'ALIMENTACAO',
  'CONSULTORIA_TECNICA',
  'PUBLICIDADE_DIVULGACAO',
  'TELEFONIA_INTERNET',
  'ALUGUEL_ESCRITORIO',
  'MATERIAL_ESCRITORIO',
  'SEGURANCA',
  'ASSESSORIA_PARLAMENTAR',
  'PESQUISA_ELEITORAL',
  'OUTRO',
];

const PROMPT_HEADER = `Você é um classificador de notas fiscais públicas da Cota para Exercício da Atividade Parlamentar (CEAP) brasileira.

Classifique CADA nota na taxonomia abaixo. Retorne APENAS JSON válido, um objeto por nota, na ordem recebida.

TAXONOMIA: ${TAXONOMY.join(', ')}

Para cada nota, retorne:
{"id": "<id_nota>", "categoria": "<UMA_DA_TAXONOMIA>", "confianca": 0.0-1.0, "subcategoria": "<texto livre curto>"}

Regras:
- Use OUTRO apenas se nenhuma categoria couber.
- Confianca < 0.6 = caso ambíguo, sinalize.
- Não invente. Não infira nada além da classificação.
`;

// ---------- CLI ----------
const args = process.argv.slice(2);
function getArg(name, def = null) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}
const YEAR = getArg('year', '2025');
const MAX = parseInt(getArg('max', '0')) || Infinity;
const BATCH_SIZE = parseInt(getArg('batch-size', '50'));
const DRY_RUN = args.includes('--dry-run');

console.log(`🤖 VERTEX CLASSIFIER CEAP`);
console.log(`   Project: ${PROJECT_ID} / Location: ${LOCATION} / Model: ${MODEL}`);
console.log(`   Year: ${YEAR}  |  Batch size: ${BATCH_SIZE}  |  Max: ${MAX === Infinity ? 'all' : MAX}`);
if (DRY_RUN) console.log(`   ⚠️  DRY-RUN — não chama API, não escreve no GCS`);

// ---------- HELPERS GCS ----------
function gsLs(prefix) {
  try {
    const out = execSync(`gsutil ls "gs://${prefix}" 2>/dev/null`, { encoding: 'utf-8' });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}
function gsCat(uri) {
  try {
    return execSync(`gsutil cat "${uri}"`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 500 });
  } catch { return null; }
}
function gsWrite(uri, content) {
  if (DRY_RUN) { console.log(`   [DRY] ${content.length} bytes → ${uri}`); return; }
  const local = `${TMP_DIR}/_up_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  writeFileSync(local, content);
  execSync(`gsutil -q cp "${local}" "${uri}"`);
  execSync(`rm -f "${local}"`);
}

// ---------- ACCESS TOKEN VERTEX ----------
function getAccessToken() {
  return execSync('gcloud auth application-default print-access-token', { encoding: 'utf-8' }).trim();
}

// ---------- LOAD CEAP NOTAS ----------
function loadNotas() {
  console.log(`\n📂 Carregando CEAP year=${YEAR} do Data Lake...`);
  const files = gsLs(`${BUCKET_CLEAN}/ceap/year=${YEAR}/`).filter(f => f.endsWith('.ndjson'));
  const notas = [];
  for (const f of files) {
    const content = gsCat(f);
    if (!content) continue;
    for (const line of content.split('\n').filter(Boolean)) {
      try {
        const r = JSON.parse(line);
        const desc = r.txtdescricao || r.descricao || '';
        const forn = r.txtfornecedor || r.fornecedor || '';
        if (!desc && !forn) continue;
        notas.push({
          id: `${r.numuloparlamentar || r.id || ''}_${r.numlote || ''}_${r.numressarcimento || r.numdocumento || Math.random().toString(36).slice(2, 8)}`,
          desc, forn,
          tipo: r.txttipoDespesa || r.descricaoEspecificacao || '',
          parl: r.numuloparlamentar || r.idDeputado || '',
        });
        if (notas.length >= MAX) return notas;
      } catch {}
    }
  }
  console.log(`   ${notas.length} notas carregadas`);
  return notas;
}

// ---------- VERTEX CALL (síncrono, batch lógico) ----------
async function classifyBatch(batch, token) {
  const notasFmt = batch.map(n => `[${n.id}] tipo="${n.tipo}" fornecedor="${n.forn}" descricao="${(n.desc || '').slice(0, 200)}"`).join('\n');
  const body = {
    contents: [{ role: 'user', parts: [{ text: PROMPT_HEADER + '\n\nNOTAS:\n' + notasFmt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: 'application/json',
    },
  };

  if (DRY_RUN) return batch.map(n => ({ id: n.id, categoria: 'DRY_RUN', confianca: 0, subcategoria: '' }));

  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;
  const cmd = `curl -s -X POST -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d @- "${url}"`;
  const tmpReq = `${TMP_DIR}/req_${Date.now()}.json`;
  writeFileSync(tmpReq, JSON.stringify(body));
  try {
    const out = execSync(`cat "${tmpReq}" | ${cmd}`, { encoding: 'utf-8', maxBuffer: 1024 * 1024 * 50 });
    execSync(`rm -f "${tmpReq}"`);
    const resp = JSON.parse(out);
    const txt = resp?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    return JSON.parse(txt);
  } catch (e) {
    console.error(`   ❌ batch falhou: ${e.message?.slice(0, 200)}`);
    return batch.map(n => ({ id: n.id, categoria: 'ERRO', confianca: 0, subcategoria: e.message?.slice(0, 80) || 'fail' }));
  }
}

// ---------- MAIN ----------
async function main() {
  const t0 = Date.now();
  const notas = loadNotas();
  if (notas.length === 0) {
    console.log('⛔ Nenhuma nota CEAP encontrada. Abortando.');
    process.exit(1);
  }

  const token = DRY_RUN ? 'DRY' : getAccessToken();
  const results = [];
  const batches = Math.ceil(notas.length / BATCH_SIZE);

  for (let i = 0; i < notas.length; i += BATCH_SIZE) {
    const batch = notas.slice(i, i + BATCH_SIZE);
    const n = Math.floor(i / BATCH_SIZE) + 1;
    process.stdout.write(`\r   batch ${n}/${batches} (${batch.length} notas)...`);
    const classified = await classifyBatch(batch, token);
    for (const c of classified) {
      results.push({ ...c, year: YEAR, snapshot: SNAPSHOT_DATE });
    }
    // Persistir a cada 1000 notas
    if (results.length >= 1000 && results.length % 1000 < BATCH_SIZE) {
      const part = Math.floor(results.length / 1000);
      const uri = `gs://${BUCKET_CLEAN}/vertex/ceap_classified/year=${YEAR}/snapshot=${SNAPSHOT_DATE}/parte-${String(part).padStart(4, '0')}.ndjson`;
      gsWrite(uri, results.slice(-1000).map(r => JSON.stringify(r)).join('\n'));
    }
  }

  // Final flush
  const uriFinal = `gs://${BUCKET_CLEAN}/vertex/ceap_classified/year=${YEAR}/snapshot=${SNAPSHOT_DATE}/parte-final.ndjson`;
  gsWrite(uriFinal, results.map(r => JSON.stringify(r)).join('\n'));

  // Summary
  const summary = {
    year: YEAR, snapshot: SNAPSHOT_DATE, total: results.length,
    por_categoria: results.reduce((a, r) => { a[r.categoria] = (a[r.categoria] || 0) + 1; return a; }, {}),
    duracao_s: ((Date.now() - t0) / 1000).toFixed(1),
    diretiva: 'Rota Vertex Calibrada — texto público apenas',
  };
  gsWrite(`gs://${BUCKET_CLEAN}/vertex/ceap_classified/year=${YEAR}/snapshot=${SNAPSHOT_DATE}/summary.json`, JSON.stringify(summary, null, 2));

  console.log(`\n\n✅ Concluído: ${results.length} notas em ${summary.duracao_s}s`);
  console.log(`   Por categoria: ${JSON.stringify(summary.por_categoria)}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
