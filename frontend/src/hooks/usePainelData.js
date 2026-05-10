/**
 * usePainelData — Single source of truth dos dados do Painel.
 *
 * ONDA 9: ranking CEAP com % de aproveitamento da cota (ponderado por meses ativos)
 * e flag de suplente — export BigQuery → GCS público.
 *
 * Fontes (todas reais, ZERO mock, ZERO Firestore):
 *   - useUniverseRoster   → 594 parlamentares (deputados+senadores) via CF (GCS)
 *   - useDashboardKPIs    → KPIs do Data Lake CEAP (notas, valor, faixa de risco)
 *   - usePNCPNacional     → Contratos PNCP nacional (CORS aberto, browser direto)
 *   - useRankingGastadores→ Ranking real CEAP via GCS público (BigQuery export)
 *   - useAlvos           → Ranking datalake de parlamentares com alto risco (Cloud Function)
 *
 * Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos
 * denúncia — apresentamos fatos." Se não temos o fato, dizemos.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "./useUserCredits.js";
import { useUniverseRoster } from "./useUniverseRoster.js";
import { useDashboardKPIs } from "./useDashboardKPIs.js";
import useAlvos from "./useAlvos.js";
import { TBR_PUBLIC_RANKING_CEAP_JSON } from "../lib/tbrPublicUrls.js";

/** Número vindo do export BigQuery (string ou número, pt/en). */
function parseAmount(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;
  const br = s.replace(/\./g, "").replace(",", ".");
  const n = Number(br);
  return Number.isFinite(n) ? n : 0;
}

function hashColor(seed) {
  let h = 5381;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  const r = 72 + ((h >>> 0) % 140);
  const g = 72 + ((((h >>> 0) / 17) | 0) % 140);
  const b = 72 + ((((h >>> 0) / 91) | 0) % 140);
  return `rgb(${r},${g},${b})`;
}

/** Mapa UF com intensidade ponderada por notas de alto risco (ranking alvos). */
function aggregateUFWithRisk(parlamentares, alvosList) {
  const base = aggregateByUF(parlamentares);
  if (!Array.isArray(alvosList) || alvosList.length === 0) return base;
  const riskMap = new Map();
  for (const a of alvosList) {
    const uf = String(a.uf || "").toUpperCase();
    if (uf.length !== 2) continue;
    riskMap.set(uf, (riskMap.get(uf) || 0) + Number(a.qtd_notas_alto_risco || 0));
  }
  const maxR = Math.max(1, ...riskMap.values());
  return base
    .map((row) => {
      const risco = riskMap.get(row.uf) || 0;
      return {
        ...row,
        risco,
        intensidade:
          risco > 0 ? Math.round((risco / maxR) * 100) : row.intensidade,
      };
    })
    .sort((a, b) => b.risco - a.risco || b.total - a.total);
}

/** Slugify nome para id estável (fallback quando não há ID Câmara). */
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
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
  const totals = [...map.values()].map((r) => r.total);
  const max = Math.max(1, ...totals);
  return [...map.values()].map((row) => ({
    uf: row.uf,
    total: row.total,
    intensidade: Math.round((row.total / max) * 100),
    risco: 0,
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

/** Hook ranking gastadores — JSON estático no GCS (Cache 5min). */
function useRankingGastadores() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        setError(null);
        const res = await fetch(`${TBR_PUBLIC_RANKING_CEAP_JSON}?v=onda9`, {
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Ranking HTTP ${res.status}`);
        const json = await res.json();
        // Aceita formato {parlamentares:[...]} ou array direto
        const arr = Array.isArray(json?.parlamentares)
          ? json.parlamentares
          : Array.isArray(json)
            ? json
            : [];
        const truthy = (v) => v === true || String(v).toLowerCase() === "true";
        const norm = arr
          .map((r, i) => {
            const nome = r.deputado || r.nome || "—";
            const idRaw = r.id ?? r.nu_deputado_id;
            const id =
              idRaw != null && String(idRaw).trim() !== ""
                ? String(idRaw).trim()
                : slugify(nome || `top-${i}`);
            const pct = parseAmount(r.pct_aproveitamento ?? r.pct ?? 0);
            const cota = parseAmount(
              r.total_brl ?? r.cota ?? r.valor_total_brl ?? r.gasto_total_brl ?? 0,
            );
            return {
              id,
              nome,
              partido: String(r.partido || "—").toUpperCase(),
              uf: String(r.uf || "—").toUpperCase(),
              cota,
              qtd_notas: parseAmount(r.qtd_notas ?? 0),
              meses_ativos: parseAmount(r.meses_ativos ?? 0),
              cota_disponivel: parseAmount(r.cota_disponivel_brl ?? r.cota_disponivel ?? 0),
              pct,
              is_suplente: truthy(r.is_suplente),
              frugalidade: pct,
              score: 0,
              sinalizacoes: 0,
              presenca: 0,
            };
          })
          .filter((p) => p.nome !== "—" && p.cota > 0);
        if (!cancel) setData(norm);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancel) {
          setData(null);
          setError(msg);
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { data, loading, error };
}

/** Hook PNCP nacional — top contratantes nas últimas 30 dias. */
function usePNCPNacional() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
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
  const { data: kpis, loading: kpisLoading, error: kpisFetchError } = useDashboardKPIs({
    pollMs: 0,
  });
  const { data: pncp, loading: pncpLoading } = usePNCPNacional();
  const { data: ranking, loading: rankingLoading, error: rankingFetchError } =
    useRankingGastadores();
  const { data: alvosPayload, loading: alvosLoading } = useAlvos({
    limit: 120,
    minScore: 0,
    sort: "notas_alto_risco",
  });
  const { user, isAuthenticated } = useAuth();
  const { credits } = useUserCredits();

  const realDataReady = Array.isArray(roster) && roster.length > 0;
  const rankingReady = Array.isArray(ranking) && ranking.length > 0;

  // Roster completo (594) — usado para mapa, partidos, sankey
  const parlamentares = useMemo(() => {
    if (!realDataReady) return [];
    return roster.map((p) => ({
      id: String(p.id),
      nome: p.nome || "—",
      partido: p.partido || "—",
      uf: p.uf || "—",
      cargo: p.cargo || "deputado",
      foto: p.urlFoto || null,
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

  // B02 — Maiores Cotas: TOP 5 PARLAMENTARES por valor (REAL, do BigQuery export)
  const maioresCotas = useMemo(() => {
    if (!rankingReady) return null;
    return [...ranking]
      .sort((a, b) => b.cota - a.cota)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        partido: `${p.partido}/${p.uf}`,
        cota: p.cota,
        pct: p.pct,
        meses_ativos: p.meses_ativos,
        is_suplente: p.is_suplente,
      }));
  }, [ranking, rankingReady]);

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
    const quotaMensalNacional = 22_000_000;
    const pct = Math.min(100, Math.round((queimadoTotal / (quotaMensalNacional * 36)) * 100));
    return {
      queimadoHoje: queimadoTotal,
      pctConsumido: pct,
    };
  }, [kpis]);

  // B06 — Mata UF: densidade do roster + volume de alto risco por UF (datalake alvos)
  const mataUF = useMemo(() => {
    if (!realDataReady) return null;
    const list = alvosPayload?.alvos;
    return aggregateUFWithRisk(parlamentares, list);
  }, [parlamentares, realDataReady, alvosPayload]);

  // B07 — Emendas críticas (proxy): alto risco CEAP + top fornecedores ou categorias
  const emendasCriticas = useMemo(() => {
    if (!kpis) return null;
    const total = Math.max(1, Number(kpis.valor_total_classificado_brl || 0));
    const alto = Number(kpis.valor_alto_risco_brl || 0);
    const pctConsumido = Math.min(100, Math.round((alto / total) * 100));
    const fromFn = Array.isArray(kpis.top_fornecedores_painel)
      ? kpis.top_fornecedores_painel
      : [];
    let topCnpj = fromFn.map((x) => ({
      cnpj: String(x.cnpj || "—"),
      risco: String(x.risco || "—"),
    }));
    if (!topCnpj.length) {
      topCnpj = (kpis.top_categorias_risco || []).slice(0, 5).map((c, i) => ({
        cnpj: String(c.categoria || "—")
          .replace(/_/g, " ")
          .slice(0, 18),
        risco: `${c.qtd} nt`,
      }));
      if (!topCnpj.length) return null;
    }
    return {
      queimadoHoje: alto,
      pctConsumido,
      topCnpj,
    };
  }, [kpis]);

  // B08 — Contratos PNCP: nacional ao vivo; fallback = histograma de faixas CEAP (datalake)
  const contratosPNCP = useMemo(() => {
    if (pncp?.amostra?.length) {
      const buckets = [
        { bucket: "<100k", count: 0, max: 1e5 },
        { bucket: "100k-1M", count: 0, max: 1e6 },
        { bucket: "1M-10M", count: 0, max: 1e7 },
        { bucket: "10M+", count: 0, max: Infinity },
      ];
      pncp.amostra.forEach((c) => {
        const v = Number(c.valor || 0);
        const b = buckets.find((bk) => v < bk.max);
        if (b) b.count += 1;
      });
      return {
        source: "pncp",
        total: pncp.totalContratos,
        valor30d: pncp.valorTotal30d,
        histograma: buckets.map(({ bucket, count }) => ({ bucket, count })),
      };
    }
    const fx = kpis?.notas_por_faixa_risco;
    if (fx && (fx.baixo > 0 || fx.medio > 0 || fx.alto > 0)) {
      return {
        source: "ceap_faixa",
        total: kpis.total_notas_classificadas,
        valor30d: kpis.valor_total_classificado_brl,
        histograma: [
          { bucket: "Baixo", count: Number(fx.baixo || 0) },
          { bucket: "Médio", count: Number(fx.medio || 0) },
          { bucket: "Alto", count: Number(fx.alto || 0) },
        ],
      };
    }
    return null;
  }, [pncp, kpis]);

  // B09 — Radar jurídico: parlamentares com notas classificadas no lake (cobertura operacional)
  const radarJuridico = useMemo(() => {
    if (!kpis) return null;
    const n = Number(kpis.total_parlamentares_cobertos || 0);
    if (n <= 0) return null;
    return { leadsAtivos: n };
  }, [kpis]);

  // B10 — Meu universo: top alvos do ranking datalake (substitui lista manual até haver favoritos)
  const meuUniverso = useMemo(() => {
    const fromHook = alvosPayload?.alvos;
    if (Array.isArray(fromHook) && fromHook.length > 0) {
      return fromHook.slice(0, 6).map((a) => ({
        id: String(a.id),
        nome: String(a.nome || a.id),
        cor: hashColor(`${a.partido}|${a.id}`),
      }));
    }
    const prev = kpis?.top_alvos_preview;
    if (Array.isArray(prev) && prev.length > 0) {
      return prev.slice(0, 6).map((a) => ({
        id: String(a.id),
        nome: String(a.nome || a.id),
        cor: hashColor(`${a.partido}|${a.id}`),
      }));
    }
    return null;
  }, [alvosPayload, kpis]);

  // B14 — Promessa × entrega: nuvem a partir das categorias de maior score agregado no lake
  const promessaEntrega = useMemo(() => {
    const cats = kpis?.top_categorias_risco;
    if (!Array.isArray(cats) || cats.length === 0) return null;
    const campanha = cats.slice(0, 10).map((c) => ({
      palavra: String(c.categoria || "")
        .replace(/_/g, " ")
        .slice(0, 28),
      tamanho: Math.min(
        55,
        14 +
          Math.min(
            40,
            Math.sqrt(Number(c.score_total || 0)) +
              Math.sqrt(Number(c.qtd || 0)) * 3,
          ),
      ),
    }));
    const lead = cats[0];
    return {
      campanha,
      entrega: {
        valor: Number(
          lead?.valor_total_brl ?? kpis.valor_total_classificado_brl ?? 0,
        ),
        metrica: "Valor na categoria líder (CEAP classificado · datalake)",
      },
    };
  }, [kpis]);

  // B16 — Rede empresarial: hub CEAP → top fornecedores; fallback hub → deputados em destaque
  const redeEmpresarial = useMemo(() => {
    const fn = Array.isArray(kpis?.top_fornecedores_painel)
      ? kpis.top_fornecedores_painel
      : [];
    if (fn.length > 0) {
      const nodes = [
        { id: "ceap", tipo: "parlamentar" },
        ...fn.map((_, i) => ({ id: `f${i}`, tipo: "empresa" })),
      ];
      const edges = fn.map((_, i) => ({ from: "ceap", to: `f${i}` }));
      return { nodes, edges };
    }
    const prev = kpis?.top_alvos_preview;
    if (Array.isArray(prev) && prev.length > 0) {
      const nodes = [
        { id: "ceap", tipo: "parlamentar" },
        ...prev.map((_, i) => ({ id: `p${i}`, tipo: "empresa" })),
      ];
      const edges = prev.map((_, i) => ({ from: "ceap", to: `p${i}` }));
      return { nodes, edges };
    }
    return null;
  }, [kpis]);

  // B11 — Mais Frugais: menor % de aproveitamento da cota; prioriza titulares (≥12 meses).
  const maisFrugais = useMemo(() => {
    if (!rankingReady) return null;
    const permanentes = ranking.filter((p) => !p.is_suplente);
    const fonte = permanentes.length >= 5 ? permanentes : ranking;
    return [...fonte]
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        nome: p.nome,
        partido: `${p.partido}/${p.uf}`,
        cota: p.cota,
        pct: p.pct,
        meses_ativos: p.meses_ativos,
        is_suplente: p.is_suplente,
        frugalidade: p.pct,
      }));
  }, [ranking, rankingReady]);

  // B12 — Influência Setorial: Sankey UF×Partido (real)
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

  // B13 — Atividade Legislativa: roster real + proxies operacionais do datalake (rótulos na UI)
  const atividadeLegislativa = useMemo(() => {
    if (!realDataReady) return null;
    const deputados = parlamentares.filter((p) => p.cargo === "deputado").length;
    const senadores = parlamentares.filter((p) => p.cargo === "senador").length;
    return {
      presenca: kpis ? Math.round(Number(kpis.cobertura_pct || 0)) : 0,
      votos: kpis?.total_notas_classificadas ?? null,
      projetos: kpis?.total_parlamentares_cobertos ?? null,
      faltas: kpis?.parse_errors ?? null,
      total: parlamentares.length,
      deputados,
      senadores,
    };
  }, [parlamentares, realDataReady, kpis]);

  // B15 — Pulso Federal: termômetro CEAP executado vs CEAP orçado teórico
  const pulsoFederal = useMemo(() => {
    if (!kpis) return null;
    const executado = Number(kpis.valor_total_classificado_brl || 0);
    const orcado = 22_000_000 * 36;
    const pct = Math.min(100, Math.round((executado / orcado) * 100));
    return {
      pct,
      executado,
      orcado,
    };
  }, [kpis]);

  // B17 — Abertura por Órgão: amostra PNCP; fallback categorias CEAP (datalake)
  const aberturaOrgao = useMemo(() => {
    if (pncp?.amostra?.length) {
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
    }
    const cats = kpis?.top_categorias_risco;
    if (!Array.isArray(cats) || cats.length === 0) return null;
    const sum = cats.reduce((acc, c) => acc + Number(c.score_total || 0), 0) || 1;
    return cats.slice(0, 5).map((c) => ({
      orgao: String(c.categoria || "—")
        .replace(/_/g, " ")
        .slice(0, 28),
      pct: Math.round((Number(c.score_total || 0) / sum) * 100),
    }));
  }, [pncp, kpis]);

  // Header — real (user logado) ou ghost
  const headerInfo = useMemo(
    () => ({
      user: user?.displayName || (isAuthenticated ? "Visitante autenticado" : "Visitante"),
      creditos: typeof credits === "number" ? credits : null,
    }),
    [user, isAuthenticated, credits],
  );

  // Para o BentoModal: ranking real preferido (cota>0); se ainda não carregou,
  // cai para o roster completo (594) — assim sempre há tabela navegável.
  const rankingParaModal = useMemo(() => {
    if (rankingReady) return ranking;
    return parlamentares;
  }, [ranking, rankingReady, parlamentares]);

  return {
    loading:
      rosterLoading ||
      kpisLoading ||
      pncpLoading ||
      rankingLoading ||
      alvosLoading,
    error: Boolean(kpisFetchError || rankingFetchError),
    kpisFetchError: kpisFetchError || null,
    rankingFetchError: rankingFetchError || null,
    realDataSource: realDataReady,

    // Reais (vivos)
    parlamentares,            // 594 (roster completo) — usado por mapaUF/sankey
    rankingGastadores: ranking, // top N CEAP real — usado por modal de cotas/frugais
    rankingParaModal,           // alias inteligente para o BentoModal
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

    emendasCriticas,
    radarJuridico,
    meuUniverso,
    promessaEntrega,
    redeEmpresarial,
  };
}
