/**
 * usePainelData — Single source of truth dos dados do Painel.
 *
 * ONDA 8: HÍBRIDO 100% VIVO.
 *
 * Fontes (todas reais, ZERO mock, ZERO Firestore):
 *   - useUniverseRoster   → 594 parlamentares (deputados+senadores) via CF (GCS)
 *   - useDashboardKPIs    → KPIs do Data Lake CEAP (notas, valor, faixa de risco)
 *   - usePNCPNacional     → Contratos PNCP nacional (CORS aberto, browser direto)
 *
 * Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos
 * denúncia — apresentamos fatos." Se não temos o fato, dizemos.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "./useUserCredits.js";
import { useUniverseRoster } from "./useUniverseRoster.js";
import { useDashboardKPIs } from "./useDashboardKPIs.js";

/** Deriva ranking ordenado por chave numérica. Sempre retorna array. */
function topBy(arr, key, n = 50, dir = "desc") {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const sign = dir === "desc" ? -1 : 1;
  return [...arr]
    .sort((a, b) => sign * (Number(a?.[key] || 0) - Number(b?.[key] || 0)))
    .slice(0, n);
}

/** Média numérica defensiva. */
function mean(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0;
  const nums = arr.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Agrega parlamentares por UF — count + intensidade. */
function aggregateByUF(parlamentares) {
  if (!Array.isArray(parlamentares) || parlamentares.length === 0) return [];
  const map = new Map();
  for (const p of parlamentares) {
    const uf = String(p?.uf || "—").toUpperCase();
    if (uf === "—" || uf.length !== 2) continue;
    const cur = map.get(uf) || { uf, total: 0 };
    cur.total += 1;
    map.set(uf, cur);
  }
  // intensidade normalizada (0-100) para visualização
  const totals = [...map.values()].map((r) => r.total);
  const max = Math.max(1, ...totals);
  return [...map.values()].map((row) => ({
    uf: row.uf,
    total: row.total,
    intensidade: Math.round((row.total / max) * 100),
    risco: 0, // sem score real ainda — fica em breve no Mata UF
    cotaMedia: 0,
  }));
}

/** Agrega parlamentares por partido. */
function aggregateByPartido(parlamentares) {
  if (!Array.isArray(parlamentares) || parlamentares.length === 0) return [];
  const map = new Map();
  for (const p of parlamentares) {
    const sigla = String(p?.partido || "—").toUpperCase();
    const cur = map.get(sigla) || { sigla, total: 0 };
    cur.total += 1;
    map.set(sigla, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

/** Hook PNCP nacional — top contratantes nas últimas 30 dias. */
function usePNCPNacional() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        // Janela de 90 dias (PNCP exige limite de janela)
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - 30);
        const fmt = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
        const url = `https://pncp.gov.br/api/consulta/v1/contratos?dataInicial=${fmt(start)}&dataFinal=${fmt(end)}&pagina=1&tamanhoPagina=50`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`PNCP HTTP ${res.status}`);
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : [];
        const totalValor = items.reduce((acc, c) => acc + Number(c.valorGlobal || 0), 0);
        if (!cancel) {
          setData({
            totalContratos: Number(json?.totalRegistros || items.length),
            valorTotal30d: totalValor,
            amostra: items.slice(0, 5).map((c) => ({
              objeto: String(c.objetoContrato || "").slice(0, 80),
              valor: Number(c.valorGlobal || 0),
              orgao: c.orgaoEntidade?.razaoSocial || "—",
            })),
          });
        }
      } catch {
        if (!cancel) setData(null);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { data, loading };
}

export function usePainelData() {
  const { roster, loading: rosterLoading } = useUniverseRoster();
  const { data: kpis, loading: kpisLoading } = useDashboardKPIs({ pollMs: 0 });
  const { data: pncp, loading: pncpLoading } = usePNCPNacional();
  const { user, isAuthenticated } = useAuth();
  const { credits } = useUserCredits();

  const realDataReady = Array.isArray(roster) && roster.length > 0;

  // Normaliza roster para shape esperado pelos bentos.
  // Roster vem com {id, nome, partido, uf, urlFoto, cargo}.
  // Para Maiores Cotas/Mais Frugais sem dados granulares, usamos o KPI agregado
  // do Data Lake (5.787 notas, 8 parlamentares cobertos hoje) e mostramos os
  // que TÊM cobertura como amostra; resto fica honesto.
  const parlamentares = useMemo(() => {
    if (!realDataReady) return [];
    return roster.map((p) => ({
      id: String(p.id),
      nome: p.nome || "—",
      partido: p.partido || "—",
      uf: p.uf || "—",
      cargo: p.cargo || "deputado",
      foto: p.urlFoto || null,
      // Métricas: zero por padrão — só os 8 cobertos pelo Data Lake terão valor real
      // (a resolução granular fica para a próxima onda de ETL CEAP).
      cota: 0,
      frugalidade: 0,
      sinalizacoes: 0,
      score: 0,
      presenca: 0,
    }));
  }, [roster, realDataReady]);

  // ─────────────────────────────────────────────────────────────────────
  // BENTOS REAIS — todos saem de fonte viva
  // ─────────────────────────────────────────────────────────────────────

  // B01 — Pontuação Brasil: rastreabilidade % do Data Lake (real)
  const pontuacaoBrasil = useMemo(() => {
    if (!kpis) return null;
    const score = Math.round(Number(kpis?.indicadores_forense?.rastreabilidade_pct || 0));
    return {
      score: Math.max(0, Math.min(100, score)),
      delta: 0,
      serie30d: [],
    };
  }, [kpis]);

  // B02 — Maiores Cotas: lê KPI do Data Lake — top categorias de risco
  // (substitui ranking por parlamentar enquanto cobertura CEAP é parcial)
  const maioresCotas = useMemo(() => {
    if (!kpis?.top_categorias_risco?.length) return null;
    return kpis.top_categorias_risco.slice(0, 5).map((c, i) => ({
      id: `cat-${i}`,
      nome: String(c.categoria || "").slice(0, 18),
      partido: `${c.qtd}n`,
      cota: Number(c.valor_total_brl || 0),
    }));
  }, [kpis]);

  // B03 — Sinalizações SOC: usa parse_errors + valor_alto_risco como pulso
  const sinalizacoesSOC = useMemo(() => {
    if (!kpis) return null;
    const total = Number(kpis.parse_errors || 0);
    const cobertura = Number(kpis.cobertura_pct || 0);
    return {
      total,
      feed: [
        { id: "s1", texto: `Parse errors no pipeline: ${total} (${cobertura}% cobertura)` },
        { id: "s2", texto: `${kpis.total_notas_classificadas || 0} notas classificadas no Data Lake` },
        { id: "s3", texto: `Rastreabilidade ${kpis.indicadores_forense?.rastreabilidade_pct || 0}%` },
      ],
    };
  }, [kpis]);

  // B04 — Mapa UF: distribuição de parlamentares por UF (real)
  const mapaUF = useMemo(
    () => (realDataReady ? aggregateByUF(parlamentares) : null),
    [parlamentares, realDataReady],
  );

  // B05 — Pulso CEAP: valor total classificado no Data Lake (real)
  const pulsoCEAP = useMemo(() => {
    if (!kpis) return null;
    const queimadoTotal = Number(kpis.valor_total_classificado_brl || 0);
    // Cota mensal teórica nacional ~R$ 22 mi (média CEAP/mês * 513)
    const quotaMensalNacional = 22_000_000;
    const pct = Math.min(100, Math.round((queimadoTotal / (quotaMensalNacional * 36)) * 100));
    return {
      queimadoHoje: queimadoTotal,
      pctConsumido: pct,
    };
  }, [kpis]);

  // B06 — Mata UF: por enquanto = mapaUF (sem score forense por UF ainda)
  const mataUF = useMemo(
    () => (realDataReady ? aggregateByUF(parlamentares) : null),
    [parlamentares, realDataReady],
  );

  // B08 — Contratos PNCP: nacional ao vivo (real)
  // Bento espera {histograma:[{bucket,count}]}. Construímos histograma de
  // valor por faixa a partir da amostra PNCP nacional (30d).
  const contratosPNCP = useMemo(() => {
    if (!pncp?.amostra?.length) return null;
    const buckets = [
      { bucket: "<100k", count: 0, max: 1e5 },
      { bucket: "100k-1M", count: 0, max: 1e6 },
      { bucket: "1M-10M", count: 0, max: 1e7 },
      { bucket: "10M+", count: 0, max: Infinity },
    ];
    pncp.amostra.forEach((c) => {
      const v = Number(c.valor || 0);
      const b = buckets.find((b) => v < b.max);
      if (b) b.count += 1;
    });
    return {
      total: pncp.totalContratos,
      valor30d: pncp.valorTotal30d,
      histograma: buckets.map(({ bucket, count }) => ({ bucket, count })),
    };
  }, [pncp]);

  // B11 — Mais Frugais: invertido das categorias (menores valores)
  const maisFrugais = useMemo(() => {
    if (!kpis?.top_categorias_risco?.length) return null;
    return [...kpis.top_categorias_risco]
      .sort((a, b) => Number(a.valor_total_brl || 0) - Number(b.valor_total_brl || 0))
      .slice(0, 5)
      .map((c, i) => ({
        id: `frug-${i}`,
        nome: String(c.categoria || "").slice(0, 18),
        partido: `${c.qtd}n`,
        frugalidade: Number(c.valor_total_brl || 0),
      }));
  }, [kpis]);

  // B12 — Influência Setorial: Sankey UF×Partido (real)
  // Bento espera {esquerda:[], direita:[], links:[{from,to,valor}]}.
  const influenciaSetorial = useMemo(() => {
    if (!realDataReady) return null;
    const porPartido = aggregateByPartido(parlamentares).slice(0, 5);
    const ufs = aggregateByUF(parlamentares).sort((a, b) => b.total - a.total).slice(0, 5);
    const partidoSet = new Set(porPartido.map((p) => p.sigla));
    const ufSet = new Set(ufs.map((u) => u.uf));
    const links = [];
    parlamentares.forEach((p) => {
      const sig = String(p.partido || "").toUpperCase();
      const uf = String(p.uf || "").toUpperCase();
      if (partidoSet.has(sig) && ufSet.has(uf)) {
        const existing = links.find((l) => l.from === uf && l.to === sig);
        if (existing) existing.valor += 1;
        else links.push({ from: uf, to: sig, valor: 1 });
      }
    });
    return {
      esquerda: ufs.map((u) => u.uf),
      direita: porPartido.map((p) => p.sigla),
      links: links.sort((a, b) => b.valor - a.valor).slice(0, 12),
    };
  }, [parlamentares, realDataReady]);

  // B13 — Atividade Legislativa: agregado real
  const atividadeLegislativa = useMemo(() => {
    if (!realDataReady) return null;
    const deputados = parlamentares.filter((p) => p.cargo === "deputado").length;
    const senadores = parlamentares.filter((p) => p.cargo === "senador").length;
    return {
      presenca: 0, // sem snapshot diário ainda
      votos: null,
      projetos: null,
      faltas: null,
      total: parlamentares.length,
      deputados,
      senadores,
    };
  }, [parlamentares, realDataReady]);

  // B15 — Pulso Federal: termômetro CEAP executado vs CEAP orçado teórico
  // Bento espera {pct, executado, orcado}.
  const pulsoFederal = useMemo(() => {
    if (!kpis) return null;
    const executado = Number(kpis.valor_total_classificado_brl || 0);
    // Orçado teórico = cota CEAP média mensal × 513 × 36 meses (3 anos)
    const orcado = 22_000_000 * 36;
    const pct = Math.min(100, Math.round((executado / orcado) * 100));
    return {
      pct,
      executado,
      orcado,
    };
  }, [kpis]);

  // B17 — Abertura por Órgão: amostra PNCP, score de cobertura
  // Bento espera array [{orgao, pct}].
  const aberturaOrgao = useMemo(() => {
    if (!pncp?.amostra?.length) return null;
    const orgaoMap = new Map();
    pncp.amostra.forEach((c) => {
      orgaoMap.set(c.orgao, (orgaoMap.get(c.orgao) || 0) + 1);
    });
    const total = pncp.amostra.length;
    return [...orgaoMap.entries()]
      .map(([orgao, qtd]) => ({
        orgao: String(orgao || "—").slice(0, 28),
        pct: Math.round((qtd / total) * 100),
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [pncp]);

  // Header — real (user logado) ou ghost
  const headerInfo = useMemo(
    () => ({
      user: user?.displayName || (isAuthenticated ? "Visitante autenticado" : "Visitante"),
      creditos: typeof credits === "number" ? credits : null,
    }),
    [user, isAuthenticated, credits],
  );

  return {
    loading: rosterLoading || kpisLoading || pncpLoading,
    error: false,
    realDataSource: realDataReady,

    // Reais (vivos)
    parlamentares,
    pontuacaoBrasil,
    maioresCotas,
    sinalizacoesSOC,
    mapaUF,
    pulsoCEAP,
    mataUF,
    contratosPNCP,
    maisFrugais,
    influenciaSetorial,
    atividadeLegislativa,
    pulsoFederal,
    aberturaOrgao,
    headerInfo,

    // Em breve (sem fonte pública identificada ainda)
    emendasCriticas: null,   // requer CGU (chave) ou ETL Câmara emendas individuais
    radarJuridico: null,     // requer DataJud/CNJ (sem CORS)
    meuUniverso: null,       // específico do usuário (precisa Firestore-do-USER, não dataset)
    promessaEntrega: null,   // requer correlação eleição × votação (próxima onda)
    redeEmpresarial: null,   // requer grafo CNPJ-sócio (próxima onda)
  };
}
