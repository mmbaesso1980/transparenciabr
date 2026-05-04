/**
 * useLandingKPIs — alimenta os 6 cards de frentes de auditoria da landing
 * com números reais vindos de `getDashboardKPIs` (Cloud Function · Data Lake).
 *
 * Estratégia:
 *  1. Lê cache local (1h) para evitar flicker em re-renders.
 *  2. Faz fetch da CF; se falhar, mantém o fallback hardcoded.
 *  3. Formata cada métrica em string curta (ex: "R$ 4 bi", "+1.200%").
 *
 * Mapeamento das 6 frentes (id → fonte na CF):
 *  - ceap        → total_ceap_brl (soma) ou total_notas_classificadas (contagem)
 *  - patrimonio  → maior_evolucao_pct (top outlier patrimonial)
 *  - gabinete    → familiares_detectados (contagem)
 *  - viagens     → passagens_anomalas (contagem)
 *  - emendas     → total_emendas_brl
 *  - contratos   → total_licitacoes (contagem PNCP)
 *
 * Quando a CF não retorna o campo, usa o fallback definido aqui.
 * ZERO Firestore — fonte única é o Data Lake via CF.
 */

import { useEffect, useState } from "react";

import { dashboardKpisUrl } from "../lib/datalakeApi.js";

const CACHE_KEY = "tbr.landing_kpis.v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

// Fallback hardcoded — exibido quando a CF está indisponível ou ainda não
// preencheu a métrica. Mesmos valores do produto v1 da landing.
export const LANDING_KPIS_FALLBACK = {
  ceap: "R$ 4 bi/ano",
  patrimonio: "+1.200%",
  gabinete: "21 secretários",
  viagens: "48 passagens",
  emendas: "R$ 50 bi",
  contratos: "3,7 mi licitações",
};

function formatBrl(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1).replace(".", ",")} bi`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1).replace(".", ",")} mi`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`;
  return `R$ ${v.toFixed(0)}`;
}

function formatCount(n, suffix = "") {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(".", ",")} mi${suffix}`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)} mil${suffix}`;
  return `${v}${suffix}`;
}

function mapPayloadToHeadlines(payload) {
  if (!payload || typeof payload !== "object") return {};
  const out = {};

  // CEAP — preferir total em BRL; se ausente, usar contagem de notas
  if (payload.total_ceap_brl) {
    const f = formatBrl(payload.total_ceap_brl);
    if (f) out.ceap = `${f}/ano`;
  } else if (payload.total_notas_classificadas) {
    const f = formatCount(payload.total_notas_classificadas, " notas");
    if (f) out.ceap = f;
  }

  // Patrimônio — outlier de evolução percentual
  if (payload.maior_evolucao_pct) {
    out.patrimonio = `+${Number(payload.maior_evolucao_pct).toLocaleString(
      "pt-BR",
    )}%`;
  }

  // Gabinete — familiares ou contagem de secretários suspeitos
  if (payload.familiares_detectados) {
    const f = formatCount(payload.familiares_detectados, " familiares");
    if (f) out.gabinete = f;
  } else if (payload.secretarios_suspeitos) {
    out.gabinete = `${payload.secretarios_suspeitos} secretários`;
  }

  // Viagens — passagens anômalas
  if (payload.passagens_anomalas) {
    out.viagens = `${payload.passagens_anomalas} passagens`;
  }

  // Emendas — total em BRL
  if (payload.total_emendas_brl) {
    const f = formatBrl(payload.total_emendas_brl);
    if (f) out.emendas = f;
  }

  // Contratos PNCP
  if (payload.total_licitacoes) {
    const f = formatCount(payload.total_licitacoes, " licitações");
    if (f) out.contratos = f;
  }

  return out;
}

function readCache() {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.t || !parsed?.headlines) return null;
    if (Date.now() - parsed.t > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(headlines, lastUpdated) {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ t: Date.now(), headlines, lastUpdated }),
    );
  } catch {
    /* localStorage indisponível */
  }
}

export function useLandingKPIs() {
  const cached = typeof window !== "undefined" ? readCache() : null;
  const [headlines, setHeadlines] = useState(
    cached?.headlines || LANDING_KPIS_FALLBACK,
  );
  const [lastUpdated, setLastUpdated] = useState(cached?.lastUpdated || null);
  const [isFresh, setIsFresh] = useState(Boolean(cached));
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const res = await fetch(dashboardKpisUrl(), {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        const mapped = mapPayloadToHeadlines(payload);
        if (cancelled) return;
        const merged = { ...LANDING_KPIS_FALLBACK, ...mapped };
        const updatedAt =
          payload?.last_updated || payload?.updated_at || new Date().toISOString();
        setHeadlines(merged);
        setLastUpdated(updatedAt);
        setIsFresh(true);
        setError(null);
        writeCache(merged, updatedAt);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        // mantém fallback / cache atual
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { headlines, lastUpdated, isFresh, error };
}

export default useLandingKPIs;
