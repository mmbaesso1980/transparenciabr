#!/usr/bin/env node
/**
 * SANGUE E PODER — Detector de parentesco oculto entre parlamentares e fornecedores.
 *
 * Cruza:
 *   - QSA (Quadro de Sócios e Administradores) da Receita Federal — sócios de empresas
 *     que receberam pagamentos via CEAP, emendas, contratos.
 *   - Árvore TSE — parentes declarados pelo candidato em sua candidatura
 *     (cônjuge, pais, irmãos, filhos), via dados de bens declarados e prestações de contas.
 *
 * Algoritmo:
 *   1. Para cada parlamentar P:
 *      a. Buscar fornecedores da CEAP de P (CNPJs únicos)
 *      b. Buscar QSA de cada CNPJ → lista de sócios (nomes + CPFs mascarados)
 *      c. Buscar árvore familiar declarada de P no TSE (parentes diretos)
 *      d. Para cada (socio, parente): calcular Jaccard de tokens de nome
 *      e. Se Jaccard ≥ 0.8 → SUSPEITA DE PARENTESCO OCULTO
 *
 * Acoplamento com F.L.A.V.I.O.:
 *   - Detector CLUSTER_FAMILIAR de FLAVIO usa SANGUE E PODER como fonte de verdade
 *     quando árvore TSE estiver disponível; senão cai no heurístico de sobrenome.
 *
 * Output:
 *   gs://datalake-tbr-clean/forensic/sangue_poder/snapshot=YYYY-MM-DD/vinculos.ndjson
 *   gs://datalake-tbr-clean/forensic/sangue_poder/snapshot=YYYY-MM-DD/summary.json
 *
 * Diretiva suprema:
 *   "Toda nota é suspeita até prova contrária"
 *   "Não fazemos denúncia — apresentamos fatos"
 *
 * Uso:
 *   node sangue_poder.js --years 2024,2025,2026
 *   node sangue_poder.js --parlamentar-id 220601
 *   node sangue_poder.js --threshold 0.8
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nameSimilarity, findMatches, tokenizeName } from './utils/fuzzy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------- CONFIG ----------
const BUCKET_RAW = 'datalake-tbr-raw';
const BUCKET_CLEAN = 'datalake-tbr-clean';
const THRESHOLD_DEFAULT = 0.8; // Plano Mestre v2.0
const SNAPSHOT_DATE = new Date().toISOString().slice(0, 10);
const LOCAL_CACHE = '/tmp/tbr_cache';
if (!existsSync(LOCAL_CACHE)) mkdirSync(LOCAL_CACHE, { recursive: true });

// ---------- CLI ----------
const args = process.argv.slice(2);
function getArg(name, def = null) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : def;
}
const YEARS = (getArg('years', '2024,2025,2026') || '').split(',').map(s => s.trim()).filter(Boolean);
const PARLAMENTAR_ID_FILTER = getArg('parlamentar-id', null);
const THRESHOLD = parseFloat(getArg('threshold', String(THRESHOLD_DEFAULT)));
const DRY_RUN = args.includes('--dry-run');

console.log(`🩸 SANGUE E PODER — snapshot ${SNAPSHOT_DATE}`);
console.log(`   Years: ${YEARS.join(', ')}  |  Threshold Jaccard: ${THRESHOLD}`);
if (PARLAMENTAR_ID_FILTER) console.log(`   Filtro: parlamentar-id=${PARLAMENTAR_ID_FILTER}`);

// ---------- HELPERS GCS ----------
function gsLs(prefix) {
  try {
    const out = execSync(`gsutil ls "gs://${prefix}" 2>/dev/null`, { encoding: 'utf-8' });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}
function gsRead(gsUri) {
  const local = join(LOCAL_CACHE, gsUri.replace(/[^a-zA-Z0-9]/g, '_'));
  if (!existsSync(local)) {
    try { execSync(`gsutil -q cp "${gsUri}" "${local}"`); }
    catch (e) { return null; }
  }
  return readFileSync(local, 'utf-8');
}
function gsWriteText(gsUri, content) {
  const local = `/tmp/_upload_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  writeFileSync(local, content);
  if (DRY_RUN) {
    console.log(`   [DRY] would upload ${content.length} bytes → ${gsUri}`);
    return;
  }
  execSync(`gsutil -q cp "${local}" "${gsUri}"`);
  execSync(`rm -f "${local}"`);
}

// ---------- LOAD CEAP (fornecedores por parlamentar) ----------
function loadCeapSuppliers() {
  console.log('\n📂 Carregando CEAP do Data Lake...');
  const byParlamentar = new Map(); // id_dep → Map<cnpj, {nome, valor_total, qtd_notas}>

  for (const year of YEARS) {
    const prefix = `${BUCKET_CLEAN}/ceap/year=${year}/`;
    const files = gsLs(prefix).filter(f => f.endsWith('.ndjson') || f.endsWith('.csv'));
    if (files.length === 0) {
      // tentar raw
      const rawFiles = gsLs(`${BUCKET_RAW}/ceap/year=${year}/`).filter(f => /\.csv$/i.test(f));
      files.push(...rawFiles);
    }

    for (const f of files) {
      const content = gsRead(f);
      if (!content) continue;
      const lines = content.split('\n').filter(Boolean);
      const isCsv = f.endsWith('.csv');
      let header = null;

      for (const line of lines) {
        let row;
        if (isCsv) {
          if (!header) { header = line.split(';').map(h => h.replace(/^"|"$/g, '').trim()); continue; }
          const cols = line.split(';').map(c => c.replace(/^"|"$/g, ''));
          row = Object.fromEntries(header.map((h, i) => [h, cols[i] || '']));
        } else {
          try { row = JSON.parse(line); } catch { continue; }
        }

        const idDep = String(row.numuloparlamentar || row.idDeputado || row.cod_parlamentar || row.id || '').trim();
        const cnpj = String(row.cnpjcpffornecedor || row.cnpjFornecedor || row.txtcnpjcpf || '').replace(/\D/g, '');
        const nomeForn = String(row.txtfornecedor || row.fornecedor || row.nomeFornecedor || '').trim();
        const valor = parseFloat(String(row.vlrliquido || row.valor || '0').replace(',', '.')) || 0;

        if (!idDep || !cnpj || cnpj.length !== 14) continue;

        if (!byParlamentar.has(idDep)) byParlamentar.set(idDep, new Map());
        const m = byParlamentar.get(idDep);
        if (!m.has(cnpj)) m.set(cnpj, { nome: nomeForn, valor_total: 0, qtd_notas: 0 });
        const f0 = m.get(cnpj);
        f0.valor_total += valor;
        f0.qtd_notas += 1;
      }
    }
  }

  let totalForn = 0;
  for (const m of byParlamentar.values()) totalForn += m.size;
  console.log(`   ${byParlamentar.size} parlamentares, ${totalForn} pares (parlamentar, fornecedor)`);
  return byParlamentar;
}

// ---------- LOAD QSA (sócios por CNPJ) ----------
function loadQSA() {
  console.log('\n🏛️  Carregando QSA Receita Federal...');
  const qsa = new Map(); // cnpj → [{nome, qual, cpf_mask}, ...]

  // Estratégia: ler arquivos NDJSON em gs://datalake-tbr-clean/qsa/
  // Formato esperado: {cnpj, socios: [{nome_socio, qualificacao, cpf_cnpj_socio}]}
  const prefixes = [
    `${BUCKET_CLEAN}/qsa/`,
    `${BUCKET_CLEAN}/receita_federal/qsa/`,
    `${BUCKET_RAW}/receita_federal/socios/`,
  ];

  let loaded = 0;
  for (const prefix of prefixes) {
    const files = gsLs(prefix).filter(f => f.endsWith('.ndjson'));
    for (const f of files) {
      const content = gsRead(f);
      if (!content) continue;
      for (const line of content.split('\n').filter(Boolean)) {
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        const cnpj = String(row.cnpj || row.cnpj_basico || '').replace(/\D/g, '').padStart(14, '0');
        if (cnpj.length !== 14) continue;
        const socios = row.socios || row.qsa || [];
        if (!Array.isArray(socios) || socios.length === 0) continue;
        qsa.set(cnpj, socios.map(s => ({
          nome: String(s.nome_socio || s.nome || '').trim(),
          qual: String(s.qualificacao || s.qualificacao_socio || '').trim(),
          cpf_mask: String(s.cpf_cnpj_socio || s.cpf || '').trim(),
        })).filter(s => s.nome));
        loaded++;
      }
    }
  }

  console.log(`   ${qsa.size} CNPJs com QSA carregados (${loaded} linhas processadas)`);
  if (qsa.size === 0) {
    console.log(`   ⚠️  QSA vazio. Ingerir Receita Federal primeiro (gs://datalake-tbr-raw/receita_federal/socios/)`);
  }
  return qsa;
}

// ---------- LOAD ÁRVORE TSE ----------
function loadTseTree() {
  console.log('\n🌳 Carregando árvore TSE (parentes declarados)...');
  const tree = new Map(); // id_parlamentar → [{nome_parente, grau, cpf_mask}]

  const prefixes = [
    `${BUCKET_CLEAN}/tse/parentes/`,
    `${BUCKET_CLEAN}/tse/familiares/`,
    `${BUCKET_CLEAN}/tse/bens_declarados/`,
  ];

  for (const prefix of prefixes) {
    const files = gsLs(prefix).filter(f => f.endsWith('.ndjson'));
    for (const f of files) {
      const content = gsRead(f);
      if (!content) continue;
      for (const line of content.split('\n').filter(Boolean)) {
        let row;
        try { row = JSON.parse(line); } catch { continue; }
        const id = String(row.id_parlamentar || row.id_deputado || row.sq_candidato || '').trim();
        if (!id) continue;
        const parentes = row.parentes || row.familiares || [];
        if (!Array.isArray(parentes) || parentes.length === 0) continue;
        if (!tree.has(id)) tree.set(id, []);
        for (const p of parentes) {
          tree.get(id).push({
            nome: String(p.nome || p.nome_parente || '').trim(),
            grau: String(p.grau || p.parentesco || '').trim(),
            cpf_mask: String(p.cpf || p.cpf_mask || '').trim(),
          });
        }
      }
    }
  }

  let total = 0;
  for (const arr of tree.values()) total += arr.length;
  console.log(`   ${tree.size} parlamentares, ${total} parentes declarados`);
  if (tree.size === 0) {
    console.log(`   ⚠️  Árvore TSE vazia. Cair no heurístico de sobrenome (FLAVIO CLUSTER_FAMILIAR).`);
  }
  return tree;
}

// ---------- DETECÇÃO PRINCIPAL ----------
function detectarVinculos(suppliers, qsa, tree) {
  console.log('\n🔍 Cruzando QSA × Árvore TSE...');
  const vinculos = [];

  for (const [idDep, fornecedores] of suppliers.entries()) {
    if (PARLAMENTAR_ID_FILTER && idDep !== PARLAMENTAR_ID_FILTER) continue;

    const parentes = tree.get(idDep) || [];
    if (parentes.length === 0) continue; // sem árvore, sem cruzamento aqui (FLAVIO trata)

    for (const [cnpj, info] of fornecedores.entries()) {
      const socios = qsa.get(cnpj);
      if (!socios || socios.length === 0) continue;

      // Buscar matches
      const sociosNomes = socios.map(s => s.nome);
      const matches = findMatches(parentes.map(p => p.nome), sociosNomes, THRESHOLD);

      for (const match of matches) {
        const parente = parentes.find(p => p.nome === match.query);
        const socio = socios.find(s => s.nome === match.match);
        const cpfMatch = parente.cpf_mask && socio.cpf_mask &&
          parente.cpf_mask.replace(/\D/g, '').slice(-6) === socio.cpf_mask.replace(/\D/g, '').slice(-6);

        vinculos.push({
          snapshot_date: SNAPSHOT_DATE,
          id_parlamentar: idDep,
          cnpj_fornecedor: cnpj,
          fornecedor_nome: info.nome,
          valor_total_pago: Math.round(info.valor_total * 100) / 100,
          qtd_notas: info.qtd_notas,
          parente_declarado: parente.nome,
          parente_grau: parente.grau,
          socio_qsa: socio.nome,
          socio_qualificacao: socio.qual,
          jaccard_score: Math.round(match.score * 1000) / 1000,
          cpf_compativel: cpfMatch,
          severidade: cpfMatch ? 'CRITICA' : (match.score >= 0.95 ? 'ALTA' : 'MEDIA'),
          fonte_evidencias: [
            `gs://${BUCKET_CLEAN}/ceap/`,
            `gs://${BUCKET_CLEAN}/qsa/`,
            `gs://${BUCKET_CLEAN}/tse/parentes/`,
          ],
          // diretiva: "apresentamos fatos, não denúncia"
          fato: `Fornecedor de CEAP do parlamentar ${idDep} possui sócio cujo nome é compatível (Jaccard=${match.score.toFixed(3)}) com parente declarado no TSE.`,
        });
      }
    }
  }

  console.log(`   ✅ ${vinculos.length} vínculos suspeitos detectados`);
  return vinculos;
}

// ---------- OUTPUT ----------
function writeOutput(vinculos) {
  console.log('\n💾 Escrevendo output no Data Lake...');
  const ndjson = vinculos.map(v => JSON.stringify(v)).join('\n');
  const summary = {
    snapshot_date: SNAPSHOT_DATE,
    threshold: THRESHOLD,
    years: YEARS,
    total_vinculos: vinculos.length,
    por_severidade: vinculos.reduce((acc, v) => { acc[v.severidade] = (acc[v.severidade] || 0) + 1; return acc; }, {}),
    valor_total_suspeito: Math.round(vinculos.reduce((s, v) => s + v.valor_total_pago, 0) * 100) / 100,
    parlamentares_envolvidos: new Set(vinculos.map(v => v.id_parlamentar)).size,
    cnpjs_envolvidos: new Set(vinculos.map(v => v.cnpj_fornecedor)).size,
    geracao: new Date().toISOString(),
    diretiva: 'Toda nota é suspeita até prova contrária. Apresentamos fatos.',
  };

  const baseUri = `gs://${BUCKET_CLEAN}/forensic/sangue_poder/snapshot=${SNAPSHOT_DATE}`;
  gsWriteText(`${baseUri}/vinculos.ndjson`, ndjson);
  gsWriteText(`${baseUri}/summary.json`, JSON.stringify(summary, null, 2));

  console.log(`   📍 ${baseUri}/vinculos.ndjson`);
  console.log(`   📍 ${baseUri}/summary.json`);
  return summary;
}

// ---------- MAIN ----------
async function main() {
  const t0 = Date.now();
  const suppliers = loadCeapSuppliers();
  const qsa = loadQSA();
  const tree = loadTseTree();

  if (suppliers.size === 0) {
    console.log('\n⛔ CEAP vazio. Abortando.');
    process.exit(1);
  }

  const vinculos = detectarVinculos(suppliers, qsa, tree);
  const summary = writeOutput(vinculos);

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n🩸 SANGUE E PODER concluído em ${dt}s`);
  console.log(`   Vínculos: ${summary.total_vinculos}`);
  console.log(`   Por severidade: ${JSON.stringify(summary.por_severidade)}`);
  console.log(`   Valor suspeito total: R$ ${summary.valor_total_suspeito.toLocaleString('pt-BR')}`);
}

main().catch(err => {
  console.error('❌ SANGUE E PODER falhou:', err);
  process.exit(1);
});
