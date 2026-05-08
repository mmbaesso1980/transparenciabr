/**
 * @file processDossieJob.js
 * @description Worker da Onda 4 — consumidor da fila `dossie_jobs`.
 *
 * Trigger: Firestore onCreate em dossie_jobs/{jobId}.
 *
 * Fluxo:
 *   1. Lê job (job_id, politico_id, camadas[])
 *   2. Para cada camada com fonte ativa, busca dados na API pública da Câmara
 *   3. Persiste resumos/agregados em transparency_reports/{politicoId}.camadas.{nome}
 *   4. Marca camadas sem fonte como { status: "em_breve", motivo: ... }
 *   5. Atualiza status do job: processing -> ready (ou partial se algumas falharem)
 *
 * Diretiva mestre (Comandante Baesso):
 *   - Dados LEVES vão para Firestore (KPIs, contagens, top-N, sumários).
 *   - Dados PESADOS (linhas brutas) vão para GCS Data Lake (Onda 4.5, futura).
 *   - "Toda nota é suspeita até prova contrária. Não fazemos denúncia — apresentamos fatos."
 *
 * Categorias canônicas tratadas nesta versão:
 *   - cat 3 (folha): Folha do Gabinete — endpoint /deputados/{id}/despesas filtrando tipo
 *     "MANUTENÇÃO DE ESCRITÓRIO DE APOIO À ATIVIDADE PARLAMENTAR" não cobre folha,
 *     então usamos /deputados/{id}/orgaos como sinal proxy + FonteIndisponível
 *     se a Câmara não publicar nominalmente. Mantemos como "parcial".
 *   - cat 4 (viagens): /deputados/{id}/despesas com tipoDespesa contendo
 *     "PASSAGENS AÉREAS", "LOCAÇÃO DE VEÍCULOS", "COMBUSTÍVEIS" — agrega por ano.
 *
 * Categorias que continuam EM BREVE (fontes externas mais complexas, ficam para Onda 5):
 *   - cat 2 (TSE Patrimônio): scraping TSE / DivulgaCand
 *   - cat 6 (PNCP detalhado): API PNCP com filtros por CPF/parlamentar
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

const FieldValue = admin.firestore.FieldValue;

// Endpoints da Câmara dos Deputados
const CAMARA_BASE = "https://dadosabertos.camara.leg.br/api/v2";
const CAMARA_TIMEOUT_MS = 12000;
const CAMARA_HEADERS = { Accept: "application/json" };

const ANO_ATUAL = new Date().getFullYear();
const ANO_INICIO = ANO_ATUAL - 2; // janela de 3 anos

/**
 * Fetch com timeout. Retorna parsed JSON ou null em erro/timeout.
 */
async function safeFetchJson(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), CAMARA_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: CAMARA_HEADERS,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[processDossieJob] HTTP ${res.status} em ${url}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(`[processDossieJob] fetch falhou em ${url}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Coleta TODAS as despesas paginadas de um deputado para um intervalo de anos.
 * Cada página da API retorna até 100 itens.
 */
async function fetchDespesasMultiAno(politicoId, anoInicio, anoFim) {
  const todas = [];
  for (let ano = anoInicio; ano <= anoFim; ano++) {
    let pagina = 1;
    while (pagina <= 30) {
      // safety cap: 30 páginas * 100 = 3000 itens por ano
      const url =
        `${CAMARA_BASE}/deputados/${encodeURIComponent(politicoId)}/despesas` +
        `?ano=${ano}&itens=100&pagina=${pagina}&ordem=ASC&ordenarPor=ano`;
      const data = await safeFetchJson(url);
      if (!data?.dados || !Array.isArray(data.dados) || data.dados.length === 0) {
        break;
      }
      todas.push(...data.dados);
      if (data.dados.length < 100) break;
      pagina += 1;
    }
  }
  return todas;
}

/**
 * Camada VIAGENS — agrega despesas das categorias de mobilidade.
 * Tipos relevantes (case-insensitive contains):
 *   - PASSAGENS AÉREAS
 *   - LOCAÇÃO OU FRETAMENTO DE VEÍCULOS AUTOMOTORES
 *   - COMBUSTÍVEIS E LUBRIFICANTES
 *   - SERVIÇO DE TÁXI, PEDÁGIO E ESTACIONAMENTO
 */
async function processarCamadaViagens(politicoId) {
  const despesas = await fetchDespesasMultiAno(politicoId, ANO_INICIO, ANO_ATUAL);
  if (!despesas) {
    return {
      status: "erro",
      motivo: "Falha de rede ao consultar API da Câmara.",
      atualizado_em: new Date().toISOString(),
    };
  }

  const TIPOS_VIAGEM = [
    "PASSAGENS AÉREAS",
    "LOCAÇÃO OU FRETAMENTO",
    "COMBUSTÍVEIS",
    "TÁXI",
    "PEDÁGIO",
    "ESTACIONAMENTO",
  ];

  const filtradas = despesas.filter((d) => {
    const tipo = String(d?.tipoDespesa || "").toUpperCase();
    return TIPOS_VIAGEM.some((t) => tipo.includes(t));
  });

  if (filtradas.length === 0) {
    return {
      status: "vazio",
      motivo: "Nenhum lançamento de viagens/pedágios/combustíveis no período analisado.",
      janela: { inicio: ANO_INICIO, fim: ANO_ATUAL },
      atualizado_em: new Date().toISOString(),
    };
  }

  // Agregação por ano e por subcategoria
  const porAno = {};
  const porSubcategoria = {};
  let totalGeral = 0;

  for (const d of filtradas) {
    const ano = Number(d?.ano) || ANO_ATUAL;
    const valor = Number(d?.valorLiquido || d?.valorDocumento || 0);
    const tipo = String(d?.tipoDespesa || "").toUpperCase();

    let cat = "outros";
    if (tipo.includes("PASSAGENS AÉREAS")) cat = "passagens_aereas";
    else if (tipo.includes("LOCAÇÃO") || tipo.includes("FRETAMENTO")) cat = "locacao_veiculo";
    else if (tipo.includes("COMBUSTÍVEIS")) cat = "combustiveis";
    else if (tipo.includes("TÁXI") || tipo.includes("PEDÁGIO") || tipo.includes("ESTACIONAMENTO"))
      cat = "taxi_pedagio";

    porAno[ano] = (porAno[ano] || 0) + valor;
    if (!porSubcategoria[cat]) porSubcategoria[cat] = { valor: 0, qtd: 0 };
    porSubcategoria[cat].valor += valor;
    porSubcategoria[cat].qtd += 1;
    totalGeral += valor;
  }

  // Top 5 lançamentos individuais
  const top5 = filtradas
    .sort(
      (a, b) =>
        Number(b?.valorLiquido || b?.valorDocumento || 0) -
        Number(a?.valorLiquido || a?.valorDocumento || 0),
    )
    .slice(0, 5)
    .map((d) => ({
      data: d?.dataDocumento || null,
      tipo: d?.tipoDespesa || null,
      fornecedor: d?.nomeFornecedor || null,
      valor: Number(d?.valorLiquido || d?.valorDocumento || 0),
      url_documento: d?.urlDocumento || null,
    }));

  return {
    status: "ready",
    fonte: "Câmara dos Deputados — API de despesas",
    janela: { inicio: ANO_INICIO, fim: ANO_ATUAL },
    total_geral: Math.round(totalGeral * 100) / 100,
    qtd_lancamentos: filtradas.length,
    por_ano: Object.fromEntries(
      Object.entries(porAno).map(([k, v]) => [k, Math.round(v * 100) / 100]),
    ),
    por_subcategoria: Object.fromEntries(
      Object.entries(porSubcategoria).map(([k, v]) => [
        k,
        { valor: Math.round(v.valor * 100) / 100, qtd: v.qtd },
      ]),
    ),
    top5,
    atualizado_em: new Date().toISOString(),
    aviso: "Toda nota é suspeita até prova contrária. Esta camada apresenta fatos da fonte oficial — análise de conformidade será incrementada nas próximas ondas.",
  };
}

/**
 * Camada FOLHA — enquanto a Câmara não publica nomes da folha em endpoint público
 * estável, fornecemos como "parcial" o sinal de comissões/órgãos do parlamentar
 * (proxy de atividade) e marcamos a coleta nominal como "em_breve".
 */
async function processarCamadaFolha(politicoId) {
  const url = `${CAMARA_BASE}/deputados/${encodeURIComponent(politicoId)}/orgaos?itens=100`;
  const data = await safeFetchJson(url);

  if (!data?.dados || !Array.isArray(data.dados)) {
    return {
      status: "em_breve",
      motivo:
        "Folha nominal do gabinete não é publicada em API pública estável da Câmara. Coleta direta exige acesso às portarias do DOU — implementação prevista para Onda 5.",
      atualizado_em: new Date().toISOString(),
    };
  }

  const orgaos = data.dados.slice(0, 30).map((o) => ({
    nome: o?.nomeOrgao || null,
    cargo: o?.titulo || null,
    inicio: o?.dataInicio || null,
    fim: o?.dataFim || null,
    sigla: o?.siglaOrgao || null,
  }));

  return {
    status: "parcial",
    fonte: "Câmara dos Deputados — API de órgãos do deputado",
    proxy: "Comissões e órgãos colegiados (sinal de atividade legislativa)",
    qtd_orgaos: orgaos.length,
    orgaos,
    pendencia: "Coleta nominal de servidores do gabinete (Onda 5) — fonte: portarias DOU.",
    atualizado_em: new Date().toISOString(),
  };
}

/**
 * Trigger principal: dispara quando um documento é criado em dossie_jobs/{jobId}.
 */
exports.processDossieJob = functions
  .region("southamerica-east1")
  .runWith({ memory: "512MB", timeoutSeconds: 540 })
  .firestore.document("dossie_jobs/{jobId}")
  .onCreate(async (snap, context) => {
    const db = admin.firestore();
    const jobId = context.params.jobId;
    const job = snap.data() || {};
    const politicoId = String(job.politico_id || "").trim();

    if (!politicoId) {
      console.error(`[processDossieJob] job ${jobId} sem politico_id — abortando.`);
      await snap.ref.update({
        status: "error",
        error: "politico_id ausente",
        finished_at: FieldValue.serverTimestamp(),
      });
      return null;
    }

    const reportRef = db.collection("transparency_reports").doc(politicoId);
    console.log(
      `[processDossieJob] iniciando job=${jobId} politico=${politicoId} camadas=${(
        job.camadas || []
      ).join(",")}`,
    );

    await snap.ref.update({
      status: "processing",
      started_at: FieldValue.serverTimestamp(),
    });

    const camadas = {};
    let okCount = 0;
    let errCount = 0;

    // Roda as duas camadas ativas em paralelo
    const [resViagens, resFolha] = await Promise.allSettled([
      processarCamadaViagens(politicoId),
      processarCamadaFolha(politicoId),
    ]);

    if (resViagens.status === "fulfilled") {
      camadas.viagens = resViagens.value;
      if (resViagens.value.status === "ready" || resViagens.value.status === "vazio") okCount++;
      else errCount++;
    } else {
      camadas.viagens = {
        status: "erro",
        motivo: resViagens.reason?.message || "Erro desconhecido",
        atualizado_em: new Date().toISOString(),
      };
      errCount++;
    }

    if (resFolha.status === "fulfilled") {
      camadas.folha = resFolha.value;
      if (resFolha.value.status === "parcial" || resFolha.value.status === "ready") okCount++;
      else if (resFolha.value.status !== "em_breve") errCount++;
    } else {
      camadas.folha = {
        status: "erro",
        motivo: resFolha.reason?.message || "Erro desconhecido",
        atualizado_em: new Date().toISOString(),
      };
      errCount++;
    }

    // Camadas EM BREVE explícitas (sem fonte ainda)
    camadas.tse_patrimonio = {
      status: "em_breve",
      motivo:
        "Coleta TSE / DivulgaCand prevista para Onda 5 (declarações de bens das últimas eleições).",
      atualizado_em: new Date().toISOString(),
    };
    camadas.pncp_detalhado = {
      status: "em_breve",
      motivo:
        "Cruzamento PNCP × parlamentar exige correlacionamento por CNPJ/empresas vinculadas — Onda 5.",
      atualizado_em: new Date().toISOString(),
    };

    const reportStatus = errCount === 0 ? "ready" : okCount > 0 ? "partial" : "error";

    await reportRef.set(
      {
        report_id: politicoId,
        status: reportStatus,
        finished_at: FieldValue.serverTimestamp(),
        camadas,
        ultima_coleta: {
          job_id: jobId,
          ok: okCount,
          erro: errCount,
        },
      },
      { merge: true },
    );

    await snap.ref.update({
      status: reportStatus,
      finished_at: FieldValue.serverTimestamp(),
      camadas_ok: okCount,
      camadas_erro: errCount,
    });

    console.log(
      `[processDossieJob] concluído job=${jobId} status=${reportStatus} ok=${okCount} erro=${errCount}`,
    );
    return null;
  });
