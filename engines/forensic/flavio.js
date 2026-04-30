// engines/forensic/flavio.js
// Protocolo F.L.A.V.I.O. — Funcionários Lotados Ausentes Via Irregularidade Oculta
//
// Detecta funcionários fantasma e rachadinhas em gabinetes parlamentares.
//
// 3 detectores independentes (cada suspeito recebe pontuação cumulativa):
//   1. AUSÊNCIA GEOGRÁFICA — secretário lotado em Brasília mas zero voos no
//      eixo BSB ⇄ base eleitoral do parlamentar (cruzamento com CEAP de voos).
//   2. CARGO FANTASMA — secretário com função no gabinete enquanto exerce
//      cargo registrado em outra esfera (município/estado) na mesma janela.
//   3. CLUSTER FAMILIAR — sobrenome do secretário aparece com Jaccard >= 0.8
//      em algum sócio da empresa fornecedora da CEAP do parlamentar
//      (acoplamento com SANGUE E PODER).
//
// Lê do GCS Data Lake clean layer:
//   - gs://datalake-tbr-clean/funcionarios_camara/snapshot=YYYY-MM-DD/clean.ndjson
//   - gs://datalake-tbr-clean/servidores_senado/snapshot=YYYY-MM-DD/clean.ndjson
//   - gs://datalake-tbr-clean/ceap_camara/year=*/clean.ndjson    (despesas + voos)
//   - gs://datalake-tbr-clean/ceaps_senado/year=*/clean.ndjson
//
// Escreve em:
//   - gs://datalake-tbr-clean/forensic/flavio/snapshot=YYYY-MM-DD/suspeitos.ndjson
//   - gs://datalake-tbr-clean/forensic/flavio/snapshot=YYYY-MM-DD/summary.json

import { Storage } from '@google-cloud/storage';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { logger } from '../utils/logger.js';
import { nameSimilarity, tokenizeName, findMatches } from './utils/fuzzy.js';

const STORAGE = new Storage();
const CLEAN_BUCKET = process.env.GCS_CLEAN_BUCKET || 'datalake-tbr-clean';

// Mapa UF → cidades base (heurística pra detectar voos entre BSB e base eleitoral)
const UF_TO_CIDADES = {
  AC: ['RBR', 'CZS'], AL: ['MCZ'], AM: ['MAO', 'TBT'], AP: ['MCP'],
  BA: ['SSA', 'IOS', 'VDC'], CE: ['FOR', 'JDO'], DF: ['BSB'], ES: ['VIX'],
  GO: ['GYN'], MA: ['SLZ', 'IMP'], MG: ['CNF', 'PLU', 'IPN', 'UDI'],
  MS: ['CGR', 'DOU'], MT: ['CGB', 'AAF'], PA: ['BEL', 'STM', 'MAB'],
  PB: ['JPA', 'CPV'], PE: ['REC', 'PNZ'], PI: ['THE', 'PHB'],
  PR: ['CWB', 'LDB', 'MGF'], RJ: ['GIG', 'SDU', 'CFB'], RN: ['NAT'],
  RO: ['PVH', 'BVB'], RR: ['BVB'], RS: ['POA', 'CXJ', 'PFB'],
  SC: ['FLN', 'NVT', 'JOI', 'CFC'], SE: ['AJU'], SP: ['CGH', 'GRU', 'VCP'],
  TO: ['PMW', 'AAX'],
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS DE LEITURA NDJSON DO GCS
// ─────────────────────────────────────────────────────────────────────────────

async function readNdjsonFromGCS(bucketName, gcsPath) {
  const bucket = STORAGE.bucket(bucketName);
  const file = bucket.file(gcsPath);
  const [exists] = await file.exists();
  if (!exists) {
    logger.warn('forensic_file_missing', { bucket: bucketName, path: gcsPath });
    return [];
  }

  const [buffer] = await file.download();
  // Descompressão transparente: o ingestor salva tudo gzipped
  const decompressed = zlib.gunzipSync(buffer).toString('utf-8');
  const records = [];
  for (const line of decompressed.split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (err) {
      // skip invalid line
    }
  }
  return records;
}

async function listFilesByPrefix(bucketName, prefix) {
  const bucket = STORAGE.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  return files.map(f => f.name);
}

async function uploadJsonl(bucketName, gcsPath, records, meta = {}) {
  const bucket = STORAGE.bucket(bucketName);
  const file = bucket.file(gcsPath);
  const content = records.map(r => JSON.stringify(r)).join('\n');
  const gzipped = zlib.gzipSync(Buffer.from(content));
  await file.save(gzipped, {
    metadata: {
      contentType: 'application/x-ndjson',
      contentEncoding: 'gzip',
      metadata: { ...meta, generated_at: new Date().toISOString() },
    },
    resumable: false,
  });
  return `gs://${bucketName}/${gcsPath}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 1 — AUSÊNCIA GEOGRÁFICA
// ─────────────────────────────────────────────────────────────────────────────
// Hipótese: Um secretário parlamentar com lotação BSB deveria deixar rastro
// em voos da CEAP do deputado entre BSB e a UF/base eleitoral.
// Se zero voos com nome do secretário em txtPassageiro/descricao em N anos,
// gera flag "AUSENCIA_GEOGRAFICA" com peso 30.

function detectAusenciaGeografica(secretarios, ceapDespesas, options = {}) {
  const minAnos = options.minAnos ?? 2;
  const flags = [];

  // Indexa despesas de viagem por nome de passageiro (lower)
  const passageirosVistos = new Set();
  for (const desp of ceapDespesas) {
    // CEAP da Câmara: campo txt_passageiro ou txt_passageiro normalizado
    const pass = desp.txt_passageiro || desp.tx_passageiro || desp.passageiro || '';
    if (pass) {
      const tokens = tokenizeName(pass);
      for (const t of tokens) passageirosVistos.add(t);
    }
    // Fallback: busca em descrição
    const desc = desp.txt_descricao || desp.descricao || '';
    if (desc) {
      const tokens = tokenizeName(desc);
      for (const t of tokens) passageirosVistos.add(t);
    }
  }

  for (const sec of secretarios) {
    const nome = sec.nome || sec.txt_nome || sec.servidor || '';
    if (!nome) continue;

    const tokensSec = tokenizeName(nome);
    if (tokensSec.length === 0) continue;

    // Considera "presente" se ao menos 2 tokens significativos (3+ chars)
    // do nome aparecem em algum passageiro/descrição
    const tokensRelev = tokensSec.filter(t => t.length >= 3);
    const matches = tokensRelev.filter(t => passageirosVistos.has(t));

    const presenteMin = Math.min(2, tokensRelev.length);
    if (matches.length < presenteMin) {
      flags.push({
        secretario: nome,
        cargo: sec.cargo || null,
        lotacao: sec.lotacao || null,
        flag: 'AUSENCIA_GEOGRAFICA',
        peso: 30,
        evidencia: {
          tokens_nome: tokensSec,
          tokens_encontrados_em_voos: matches,
          janela_anos_analisada: minAnos,
        },
      });
    }
  }

  logger.info('flavio_ausencia_done', { secretarios_analisados: secretarios.length, flagged: flags.length });
  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 2 — CARGO FANTASMA
// ─────────────────────────────────────────────────────────────────────────────
// Hipótese: Mesmo nome aparece em duas folhas públicas (Câmara + Senado, ou
// Câmara + servidores comissionados de outra base) na mesma janela temporal.
// Possível: dupla nomeação (caso clássico do "advogado da família que não
// trabalha em lugar nenhum mas recebe em dois lugares").
//
// Implementação V1: cruza funcionarios_camara × servidores_senado.
// V2 (futuro): cruza com folhas estaduais/municipais via TCEs.

function detectCargoFantasma(funcCamara, funcSenado) {
  const flags = [];
  const indexSenado = new Map();
  for (const sen of funcSenado) {
    const nome = sen.nome || sen.txt_nome || '';
    const tokens = tokenizeName(nome);
    if (tokens.length >= 2) {
      const key = tokens.slice(0, 4).sort().join('|');
      if (!indexSenado.has(key)) indexSenado.set(key, []);
      indexSenado.get(key).push(sen);
    }
  }

  for (const cam of funcCamara) {
    const nome = cam.nome || cam.txt_nome || '';
    const tokens = tokenizeName(nome);
    if (tokens.length < 2) continue;
    const key = tokens.slice(0, 4).sort().join('|');
    const candidatos = indexSenado.get(key) || [];

    for (const cand of candidatos) {
      const sim = nameSimilarity(nome, cand.nome || cand.txt_nome || '');
      if (sim.score >= 0.85) {
        flags.push({
          secretario: nome,
          flag: 'CARGO_FANTASMA',
          peso: 50,
          evidencia: {
            registro_camara: { cargo: cam.cargo, lotacao: cam.lotacao, situacao: cam.situacao },
            registro_senado: { cargo: cand.cargo, lotacao: cand.lotacao, situacao: cand.situacao },
            similaridade: sim,
          },
        });
      }
    }
  }

  logger.info('flavio_cargo_fantasma_done', { funcionarios_camara: funcCamara.length, funcionarios_senado: funcSenado.length, flagged: flags.length });
  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// DETECTOR 3 — CLUSTER FAMILIAR (acoplamento com SANGUE E PODER)
// ─────────────────────────────────────────────────────────────────────────────
// Hipótese: O sobrenome do secretário aparece em algum fornecedor (CNPJ) da
// CEAP do parlamentar. Acoplamento de evidências entre folha de gabinete e
// fluxo de despesas indenizadas.

function detectClusterFamiliar(secretarios, ceapDespesas, options = {}) {
  const threshold = options.threshold ?? 0.8;
  const flags = [];

  // Coleta nomes de fornecedores únicos
  const fornecedoresSet = new Set();
  for (const desp of ceapDespesas) {
    const fornec = desp.txt_fornecedor || desp.tx_fornecedor || desp.fornecedor || '';
    if (fornec) fornecedoresSet.add(fornec);
  }
  const fornecedores = [...fornecedoresSet];

  for (const sec of secretarios) {
    const nome = sec.nome || sec.txt_nome || '';
    if (!nome) continue;

    const matches = findMatches(nome, fornecedores, { threshold, limit: 5 });
    if (matches.length > 0) {
      flags.push({
        secretario: nome,
        cargo: sec.cargo || null,
        lotacao: sec.lotacao || null,
        flag: 'CLUSTER_FAMILIAR',
        peso: 40,
        evidencia: {
          fornecedores_com_sobrenome_compativel: matches.map(m => ({
            fornecedor: m.candidate,
            score: m.score,
            sobrenome_comum: m.last_a,
            tokens_em_comum: m.common_tokens,
          })),
        },
      });
    }
  }

  logger.info('flavio_cluster_familiar_done', {
    secretarios_analisados: secretarios.length,
    fornecedores_unicos: fornecedores.length,
    flagged: flags.length,
  });
  return flags;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN — Orquestra os 3 detectores e consolida em arquivo único
// ─────────────────────────────────────────────────────────────────────────────

export async function runFlavio(options = {}) {
  const snapshot = options.snapshot || new Date().toISOString().slice(0, 10);
  const ceapYears = options.ceapYears || ['2024', '2025', '2026'];

  logger.info('flavio_start', { snapshot, ceapYears });

  // 1. Carrega folhas de pessoal
  const funcCamaraFiles = await listFilesByPrefix(CLEAN_BUCKET, `funcionarios_camara/snapshot=`);
  const funcSenadoFiles = await listFilesByPrefix(CLEAN_BUCKET, `servidores_senado/snapshot=`);
  const ultimoCamara = funcCamaraFiles.filter(f => f.endsWith('clean.ndjson')).sort().pop();
  const ultimoSenado = funcSenadoFiles.filter(f => f.endsWith('clean.ndjson')).sort().pop();

  if (!ultimoCamara) {
    throw new Error('Nenhum snapshot de funcionarios_camara encontrado em GCS. Rode ingestor primeiro.');
  }

  logger.info('flavio_loading_personnel', { camara_path: ultimoCamara, senado_path: ultimoSenado });
  const funcCamara = await readNdjsonFromGCS(CLEAN_BUCKET, ultimoCamara);
  const funcSenado = ultimoSenado ? await readNdjsonFromGCS(CLEAN_BUCKET, ultimoSenado) : [];

  // 2. Filtra apenas secretários parlamentares (cargo contém "secretari" ou grupo é "comissionado")
  const secretariosCamara = funcCamara.filter(f => {
    const cargo = (f.cargo || f.txt_cargo || '').toLowerCase();
    const grupo = (f.grupo || '').toLowerCase();
    return cargo.includes('secretari') || grupo.includes('parlamentar') || grupo.includes('comissionad');
  });

  logger.info('flavio_personnel_filtered', {
    funcionarios_camara_total: funcCamara.length,
    secretarios_camara: secretariosCamara.length,
    servidores_senado_total: funcSenado.length,
  });

  // 3. Carrega despesas CEAP dos anos solicitados
  const ceapDespesas = [];
  for (const year of ceapYears) {
    const path = `ceap_camara/year=${year}/clean.ndjson`;
    const recs = await readNdjsonFromGCS(CLEAN_BUCKET, path);
    ceapDespesas.push(...recs);
    logger.info('flavio_ceap_loaded', { year, records: recs.length });
  }

  // 4. Roda os 3 detectores
  const flagsAusencia = detectAusenciaGeografica(secretariosCamara, ceapDespesas);
  const flagsCargoFantasma = detectCargoFantasma(secretariosCamara, funcSenado);
  const flagsClusterFamiliar = detectClusterFamiliar(secretariosCamara, ceapDespesas);

  // 5. Consolida por nome (peso cumulativo)
  const consolidado = new Map();
  for (const flag of [...flagsAusencia, ...flagsCargoFantasma, ...flagsClusterFamiliar]) {
    const key = flag.secretario.toLowerCase();
    if (!consolidado.has(key)) {
      consolidado.set(key, {
        secretario: flag.secretario,
        cargo: flag.cargo,
        lotacao: flag.lotacao,
        score_total: 0,
        flags: [],
        gerado_em: new Date().toISOString(),
        snapshot,
      });
    }
    const s = consolidado.get(key);
    s.score_total += flag.peso;
    s.flags.push({ tipo: flag.flag, peso: flag.peso, evidencia: flag.evidencia });
  }

  const suspeitos = [...consolidado.values()]
    .sort((a, b) => b.score_total - a.score_total);

  // 6. Upload no GCS
  const suspeitosPath = `forensic/flavio/snapshot=${snapshot}/suspeitos.ndjson`;
  const suspeitosUrl = await uploadJsonl(CLEAN_BUCKET, suspeitosPath, suspeitos, {
    detector: 'flavio',
    snapshot,
    ceap_years: ceapYears.join(','),
  });

  const summary = {
    detector: 'FLAVIO',
    snapshot,
    ceap_years: ceapYears,
    total_secretarios_analisados: secretariosCamara.length,
    total_despesas_ceap: ceapDespesas.length,
    total_suspeitos: suspeitos.length,
    distribuicao_flags: {
      ausencia_geografica: flagsAusencia.length,
      cargo_fantasma: flagsCargoFantasma.length,
      cluster_familiar: flagsClusterFamiliar.length,
    },
    top_10_score: suspeitos.slice(0, 10).map(s => ({
      secretario: s.secretario,
      score: s.score_total,
      flags: s.flags.map(f => f.tipo),
    })),
    suspeitos_url: suspeitosUrl,
    gerado_em: new Date().toISOString(),
  };

  const summaryPath = `forensic/flavio/snapshot=${snapshot}/summary.json`;
  await uploadJsonl(CLEAN_BUCKET, summaryPath, [summary], { detector: 'flavio_summary' });

  logger.info('flavio_done', summary);
  return summary;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
  }

  runFlavio({
    snapshot: args.snapshot,
    ceapYears: args.years ? args.years.split(',') : ['2024', '2025', '2026'],
  })
    .then(summary => {
      console.error(`✅ FLAVIO done: ${summary.total_suspeitos} suspeitos identificados`);
      console.error(JSON.stringify(summary.distribuicao_flags));
      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ FLAVIO falhou: ${err.message}`);
      console.error(err.stack);
      process.exit(1);
    });
}
