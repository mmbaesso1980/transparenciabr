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
  return {
    // Score 0-100, baseado no índice de risco Aurora (0-1)
    score_aurora:
      typeof kpis.indice_risco_aurora === "number"
        ? Math.round(kpis.indice_risco_aurora * 100)
        : null,
    // Total CEAP classificado em BRL (acumulado nos anos disponíveis)
    ceap_acumulado:
      typeof kpis.valor_total_classificado_brl === "number"
        ? kpis.valor_total_classificado_brl
        : null,
    // Quantidade de notas em alto risco (proxy para "sinalizações")
    qtd_notas_alto_risco:
      typeof kpis.qtd_notas_alto_risco === "number"
        ? kpis.qtd_notas_alto_risco
        : null,
    // Percentual de rastreabilidade (proxy para "presença"/qualidade do dossiê)
    rastreabilidade_pct:
      typeof kpis.rastreabilidade_pct === "number"
        ? kpis.rastreabilidade_pct
        : null,
  };
}
