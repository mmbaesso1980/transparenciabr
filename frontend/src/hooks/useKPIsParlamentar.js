/**
 * @file useKPIsParlamentar.js
 * @description Hook da Onda 5 — busca KPIs reais do parlamentar diretamente
 * do Data Lake (GCS ceap_classified/) via Cloud Function pública
 * `getDossieCeapKPIs` (HTTP, sem auth necessária).
 *
 * Retorna estado:
 *   - loading: true enquanto busca
 *   - kpis:    objeto com KPIs reais OU null se não houver dados classificados
 *   - hasData: boolean (true se a CF retornou 200, false se 404)
 *   - error:   erro de rede (não conta 404 como erro — apenas hasData=false)
 *
 * O 404 da CF significa "este parlamentar ainda não foi processado pelo
 * pipeline de classificação Aurora". Não é falha — é estado.
 *
 * Diretiva: nunca inventar dado. Se 404, retorna null e a UI mostra
 * "EM BREVE — clique em Atualizar agora para disparar coleta sob demanda."
 */

import { useState, useEffect } from "react";

const KPIS_ENDPOINT =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getDossieCeapKPIs";

export function useKPIsParlamentar(politicoId) {
  const [state, setState] = useState({
    loading: true,
    kpis: null,
    hasData: false,
    error: null,
  });

  useEffect(() => {
    if (!politicoId) {
      setState({ loading: false, kpis: null, hasData: false, error: null });
      return;
    }

    let mounted = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    const url = `${KPIS_ENDPOINT}?id=${encodeURIComponent(politicoId)}`;

    fetch(url, { method: "GET" })
      .then(async (res) => {
        if (!mounted) return;
        if (res.status === 404) {
          // Político ainda não classificado — estado normal, não é erro
          setState({
            loading: false,
            kpis: null,
            hasData: false,
            error: null,
          });
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        setState({
          loading: false,
          kpis: data,
          hasData: true,
          error: null,
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setState({
          loading: false,
          kpis: null,
          hasData: false,
          error: err.message || String(err),
        });
      });

    return () => {
      mounted = false;
    };
  }, [politicoId]);

  return state;
}

/**
 * Helper: extrai os 4 KPIs canônicos do hero a partir do payload da CF.
 * Retorna sempre um objeto consistente, com `null` para campos ausentes.
 */
export function extractHeroKPIs(kpis) {
  if (!kpis) {
    return {
      score_aurora: null,
      ceap_acumulado: null,
      qtd_notas_alto_risco: null,
      rastreabilidade_pct: null,
    };
  }
  // Workaround Onda 6: o backend está zerando `valor_total_classificado_brl`
  // em alguns casos (bug do agregador), mas `serie_valor_anual_brl` e
  // `top_categorias_valor` vêm corretos. Derivamos o total dessas fontes
  // como fallback, na ordem: backend > série anual > top categorias.
  const totalDaSerie = Array.isArray(kpis.serie_valor_anual_brl)
    ? kpis.serie_valor_anual_brl.reduce(
        (acc, r) => acc + (Number(r?.valor_brl) || 0),
        0,
      )
    : 0;
  const totalDasCategorias = Array.isArray(kpis.top_categorias_valor)
    ? kpis.top_categorias_valor.reduce(
        (acc, r) => acc + (Number(r?.valor_brl) || 0),
        0,
      )
    : 0;
  const ceapBackend =
    typeof kpis.valor_total_classificado_brl === "number"
      ? kpis.valor_total_classificado_brl
      : 0;
  const ceapDerivado =
    ceapBackend > 0
      ? ceapBackend
      : totalDaSerie > 0
        ? totalDaSerie
        : totalDasCategorias > 0
          ? totalDasCategorias
          : null;

  // Notas alto risco: backend pode zerar; derivamos somando qtd das
  // categorias se backend vier 0 mas houver registros.
  const totalNotas = Array.isArray(kpis.top_categorias_valor)
    ? kpis.top_categorias_valor.reduce(
        (acc, r) => acc + (Number(r?.qtd) || 0),
        0,
      )
    : 0;
  const notasBackend =
    typeof kpis.qtd_notas_alto_risco === "number"
      ? kpis.qtd_notas_alto_risco
      : 0;
  const notasDerivado =
    notasBackend > 0 ? notasBackend : totalNotas > 0 ? totalNotas : null;

  return {
    // Score 0-100, baseado no índice de risco Aurora (0-1)
    score_aurora:
      typeof kpis.indice_risco_aurora === "number"
        ? Math.round(kpis.indice_risco_aurora * 100)
        : null,
    // Total CEAP classificado em BRL (acumulado nos anos disponíveis)
    ceap_acumulado: ceapDerivado,
    // Quantidade de notas (alto risco quando há score; senão total classificado)
    qtd_notas_alto_risco: notasDerivado,
    // Percentual de rastreabilidade (proxy para "presença"/qualidade do dossiê)
    rastreabilidade_pct:
      typeof kpis.rastreabilidade_pct === "number"
        ? kpis.rastreabilidade_pct
        : null,
  };
}

/**
 * Helper para o drawer de drill-down: agrupa série anual + top categorias
 * de forma limpa para a UI consumir sem precisar conhecer o schema da CF.
 */
export function extractCeapBreakdown(kpis) {
  if (!kpis) return { serieAnual: [], topCategorias: [], totalGeral: 0 };
  const serieAnual = Array.isArray(kpis.serie_valor_anual_brl)
    ? [...kpis.serie_valor_anual_brl].sort((a, b) =>
        String(a.ano).localeCompare(String(b.ano)),
      )
    : [];
  const topCategorias = Array.isArray(kpis.top_categorias_valor)
    ? [...kpis.top_categorias_valor]
        .map((c) => ({
          categoria: String(c.categoria ?? "—")
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          valor_brl: Number(c.valor_brl) || 0,
          qtd: Number(c.qtd) || 0,
        }))
        .sort((a, b) => b.valor_brl - a.valor_brl)
    : [];
  const totalGeral = serieAnual.reduce(
    (acc, r) => acc + (Number(r.valor_brl) || 0),
    0,
  );
  return { serieAnual, topCategorias, totalGeral };
}
