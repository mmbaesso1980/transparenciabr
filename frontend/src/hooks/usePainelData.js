/**
 * usePainelData — Single source of truth dos dados do Painel.
 *
 * MOCK ZERO. Cada bento devolve:
 *   - dado real calculado a partir do Firestore quando possível, OU
 *   - `null` (e o bento renderiza estado "Em breve" honesto)
 *
 * Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos
 * denúncia — apresentamos fatos." Se não temos o fato, dizemos.
 */

import { useMemo } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { useUserCredits } from "./useUserCredits.js";
import { useParlamentares } from "./useParlamentares.js";

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

/** Agrega parlamentares por UF — count + score médio. */
function aggregateByUF(parlamentares) {
  if (!Array.isArray(parlamentares) || parlamentares.length === 0) return [];
  const map = new Map();
  for (const p of parlamentares) {
    const uf = String(p?.uf || "—").toUpperCase();
    if (uf === "—" || uf.length !== 2) continue;
    const cur = map.get(uf) || { uf, total: 0, somaScore: 0, somaCota: 0 };
    cur.total += 1;
    cur.somaScore += Number(p?.score) || 0;
    cur.somaCota += Number(p?.cota) || 0;
    map.set(uf, cur);
  }
  return [...map.values()].map((row) => ({
    uf: row.uf,
    total: row.total,
    intensidade: row.total, // count vira heatmap
    risco: row.total > 0 ? Math.round(row.somaScore / row.total) : 0,
    cotaMedia: row.total > 0 ? row.somaCota / row.total : 0,
  }));
}

export function usePainelData() {
  const { data: parlReal, isLoading, isError } = useParlamentares();
  const { user, isAuthenticated } = useAuth();
  const { credits } = useUserCredits();

  const realDataReady = Array.isArray(parlReal) && parlReal.length > 0;

  // ---------------------------------------------------------------------------
  // FONTE PRIMÁRIA — todos os 513 deputados normalizados do Firestore
  // ---------------------------------------------------------------------------
  const parlamentares = useMemo(
    () => (realDataReady ? parlReal : []),
    [parlReal, realDataReady],
  );

  // ---------------------------------------------------------------------------
  // BENTOS REAIS — calculados a partir dos parlamentares
  // ---------------------------------------------------------------------------

  // B01 — Pontuação Brasil: score médio nacional (escala 0-100)
  const pontuacaoBrasil = useMemo(() => {
    if (!realDataReady) return null;
    const avg = mean(parlamentares.map((p) => p.score));
    // Score chega tipicamente em 0-100; se vier 0-1, escala
    const score = avg > 1 ? Math.round(avg) : Math.round(avg * 100);
    return {
      score: Math.max(0, Math.min(100, score)),
      delta: 0, // série temporal precisa snapshots — em breve
      serie30d: [], // em breve
    };
  }, [parlamentares, realDataReady]);

  // B02 — Maiores Cotas: real, top por cota_anual
  const maioresCotas = useMemo(
    () => (realDataReady ? topBy(parlamentares, "cota", 50, "desc") : null),
    [parlamentares, realDataReady],
  );

  // B04 — Mapa UF: real, distribuição de parlamentares por UF
  const mapaUF = useMemo(
    () => (realDataReady ? aggregateByUF(parlamentares) : null),
    [parlamentares, realDataReady],
  );

  // B06 — Mata UF (versão risco): real, score médio por UF
  const mataUF = useMemo(
    () => (realDataReady ? aggregateByUF(parlamentares) : null),
    [parlamentares, realDataReady],
  );

  // B11 — Mais Frugais: real, top por frugalidade
  const maisFrugais = useMemo(
    () => (realDataReady ? topBy(parlamentares, "frugalidade", 50, "desc") : null),
    [parlamentares, realDataReady],
  );

  // B13 — Atividade Legislativa: real, agregado dos parlamentares
  const atividadeLegislativa = useMemo(() => {
    if (!realDataReady) return null;
    const presencaMedia = Math.round(mean(parlamentares.map((p) => p.presenca)));
    return {
      presenca: presencaMedia,
      votos: null, // em breve
      projetos: null,
      faltas: null,
    };
  }, [parlamentares, realDataReady]);

  // Header — real (user logado) ou ghost
  const headerInfo = useMemo(
    () => ({
      user: user?.displayName || (isAuthenticated ? "Visitante autenticado" : "Visitante"),
      creditos: typeof credits === "number" ? credits : null,
    }),
    [user, isAuthenticated, credits],
  );

  // ---------------------------------------------------------------------------
  // BENTOS "EM BREVE" — sem fonte real ainda; null sinaliza estado vazio
  // ---------------------------------------------------------------------------
  // Para serem ligados em PRs subsequentes (precisam Cloud Function ou
  // coleção dedicada que ainda não existe).

  return {
    loading: isLoading,
    error: isError,
    realDataSource: realDataReady,

    // Reais
    parlamentares,
    pontuacaoBrasil,
    maioresCotas,
    mapaUF,
    mataUF,
    maisFrugais,
    atividadeLegislativa,
    headerInfo,

    // Em breve (null → componente renderiza placeholder honesto)
    sinalizacoesSOC: null,
    pulsoCEAP: null,
    emendasCriticas: null,
    contratosPNCP: null,
    radarJuridico: null,
    meuUniverso: null,
    influenciaSetorial: null,
    promessaEntrega: null,
    pulsoFederal: null,
    redeEmpresarial: null,
    aberturaOrgao: null,
  };
}
