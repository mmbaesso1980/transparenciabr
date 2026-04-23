/**
 * scripts/aggregate-parlamentar-counters.js
 *
 * Agrega contadores em cada documento de parlamentares/{id}:
 *   - totalEmendasPix, totalEmendasRp6, totalEmendasRp7, totalEmendasRp8
 *   - totalCEAP, qtdDespesasCEAP
 *   - qtdVotacoes, qtdPresencas, percentualPresenca
 *   - topMunicipiosEmendas (top 3 por valor pago)
 *   - topFornecedoresCEAP (top 5 por valor líquido)
 *   - _agregadoEm (timestamp)
 *
 * Uso:
 *   node scripts/aggregate-parlamentar-counters.js
 *   node scripts/aggregate-parlamentar-counters.js --only=CAMARA
 *   node scripts/aggregate-parlamentar-counters.js --id=209787
 *
 * Requer:
 *   GOOGLE_APPLICATION_CREDENTIALS=./chave-servico.json
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || 'fiscallizapa',
  });
}

const db = admin.firestore();
const BATCH_SIZE = 450;
const SLEEP_MS = 150;

const args = process.argv.slice(2).reduce((acc, a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  acc[k] = v ?? true;
  return acc;
}, {});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseNumber(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

async function sumCollection(colName, parlamentarField, parlamentarId, valorField) {
  const snap = await db
    .collection(colName)
    .where(parlamentarField, '==', parlamentarId)
    .get();

  let total = 0;
  let count = 0;
  for (const doc of snap.docs) {
    const v = parseNumber(doc.data()[valorField]);
    total += v;
    count += 1;
  }
  return { total, count, docs: snap.docs };
}

function topN(map, n, nameField) {
  return Object.entries(map)
    .sort((a, b) => b[1].valor - a[1].valor)
    .slice(0, n)
    .map(([key, obj]) => ({ [nameField]: key, ...obj }));
}

async function agregarUm(parlamentarDoc) {
  const parlamentarId = parlamentarDoc.id;
  const parlamentar = parlamentarDoc.data();
  const casa = parlamentar.casa || 'CAMARA';

  const ceapField = casa === 'CAMARA' ? 'idDeputado' : 'idSenador';

  // 1. Emendas PIX
  const pix = await sumCollection('emendas_pix', 'idParlamentar', parlamentarId, 'valorPago');

  // 2. Emendas RP6 / RP7 / RP8
  const [rp6, rp7, rp8] = await Promise.all([
    sumCollection('emendas_rp6', 'idParlamentar', parlamentarId, 'valorPago'),
    sumCollection('emendas_rp7', 'idParlamentar', parlamentarId, 'valorPago'),
    sumCollection('emendas_rp8', 'idParlamentar', parlamentarId, 'valorPago'),
  ]);

  // 3. Top municípios (consolidado de todas as emendas)
  const municipioMap = {};
  for (const docs of [pix.docs, rp6.docs, rp7.docs, rp8.docs]) {
    for (const d of docs) {
      const data = d.data();
      const key = data.nomeMunicipio
        ? `${data.nomeMunicipio}-${data.uf || data.ufDestino || ''}`
        : data.codIbge;
      if (!key) continue;
      if (!municipioMap[key]) {
        municipioMap[key] = {
          valor: 0,
          qtd: 0,
          codIbge: data.codIbge,
          uf: data.uf || data.ufDestino,
        };
      }
      municipioMap[key].valor += parseNumber(data.valorPago);
      municipioMap[key].qtd += 1;
    }
  }
  const topMunicipiosEmendas = topN(municipioMap, 3, 'nomeMunicipio');

  // 4. CEAP (apenas CAMARA)
  let ceap = { total: 0, count: 0, docs: [] };
  if (casa === 'CAMARA') {
    ceap = await sumCollection('despesas_ceap', ceapField, parlamentarId, 'valorLiquido');
  }

  // 5. Top fornecedores CEAP
  const fornecedorMap = {};
  for (const d of ceap.docs) {
    const data = d.data();
    const key = data.cnpjCpf || data.fornecedor || 'DESCONHECIDO';
    if (!fornecedorMap[key]) {
      fornecedorMap[key] = {
        valor: 0,
        qtd: 0,
        nome: data.fornecedor || '',
        cnpjCpf: data.cnpjCpf || '',
      };
    }
    fornecedorMap[key].valor += parseNumber(data.valorLiquido);
    fornecedorMap[key].qtd += 1;
  }
  const topFornecedoresCEAP = topN(fornecedorMap, 5, 'cnpjCpfKey');

  // 6. Votações
  const votosSnap = await db
    .collection('votos')
    .where('idParlamentar', '==', parlamentarId)
    .get();

  let qtdVotacoes = votosSnap.size;
  let qtdPresencas = 0;
  let qtdSim = 0;
  let qtdNao = 0;
  let qtdAbstencao = 0;
  for (const v of votosSnap.docs) {
    const voto = (v.data().voto || '').toUpperCase();
    if (voto && voto !== 'AUSENTE' && voto !== 'ART17') qtdPresencas += 1;
    if (voto === 'SIM') qtdSim += 1;
    else if (voto === 'NAO' || voto === 'NÃO') qtdNao += 1;
    else if (voto === 'ABSTENCAO' || voto === 'ABSTENÇÃO') qtdAbstencao += 1;
  }
  const percentualPresenca =
    qtdVotacoes > 0 ? Number(((qtdPresencas / qtdVotacoes) * 100).toFixed(1)) : null;

  // 7. Montar payload final
  const payload = {
    totalEmendasPix: pix.total,
    qtdEmendasPix: pix.count,
    totalEmendasRp6: rp6.total,
    qtdEmendasRp6: rp6.count,
    totalEmendasRp7: rp7.total,
    qtdEmendasRp7: rp7.count,
    totalEmendasRp8: rp8.total,
    qtdEmendasRp8: rp8.count,
    totalEmendasGeral: pix.total + rp6.total + rp7.total + rp8.total,
    totalCEAP: ceap.total,
    qtdDespesasCEAP: ceap.count,
    qtdVotacoes,
    qtdPresencas,
    percentualPresenca,
    qtdVotoSim: qtdSim,
    qtdVotoNao: qtdNao,
    qtdVotoAbstencao: qtdAbstencao,
    topMunicipiosEmendas,
    topFornecedoresCEAP,
    _agregadoEm: admin.firestore.FieldValue.serverTimestamp(),
  };

  return { ref: parlamentarDoc.ref, payload, nome: parlamentar.nome };
}

async function run() {
  console.log('🔎 Iniciando agregação de contadores...');
  const startTs = Date.now();

  let query = db.collection('parlamentares');
  if (args.only) query = query.where('casa', '==', args.only.toUpperCase());

  let docs = [];
  if (args.id) {
    const single = await db.collection('parlamentares').doc(String(args.id)).get();
    if (!single.exists) {
      console.error(`❌ Parlamentar ${args.id} não encontrado`);
      process.exit(1);
    }
    docs = [single];
  } else {
    const snap = await query.get();
    docs = snap.docs;
  }

  console.log(`📊 Processando ${docs.length} parlamentares...`);

  let processados = 0;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of docs) {
    try {
      const { ref, payload, nome } = await agregarUm(doc);
      batch.set(ref, payload, { merge: true });
      batchCount += 1;
      processados += 1;

      console.log(
        `  ✓ [${processados}/${docs.length}] ${nome} | ` +
          `emendas=R$${payload.totalEmendasGeral.toLocaleString('pt-BR')} | ` +
          `CEAP=R$${payload.totalCEAP.toLocaleString('pt-BR')} | ` +
          `votos=${payload.qtdVotacoes}`
      );

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`  💾 Commit de ${batchCount} docs`);
        batch = db.batch();
        batchCount = 0;
        await sleep(SLEEP_MS);
      }
    } catch (err) {
      console.error(`  ❌ Erro em ${doc.id}: ${err.message}`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`  💾 Commit final de ${batchCount} docs`);
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
  console.log(`\n✅ Concluído. ${processados} parlamentares agregados em ${elapsed}s.`);
}

run().catch((err) => {
  console.error('💥 Falha fatal:', err);
  process.exit(1);
});
