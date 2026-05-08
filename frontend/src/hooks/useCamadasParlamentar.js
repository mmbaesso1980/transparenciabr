/**
 * @file useCamadasParlamentar.js
 * @description Onda 7 — Despertar dos Bancos. Hooks client-side que consomem
 * a API pública da Câmara dos Deputados (dadosabertos.camara.leg.br) com CORS
 * aberto, sem precisar de deploy de Cloud Function. Centralizamos cache em
 * memória por id+ano para não martelar a API durante a navegação.
 *
 * Camadas vivas servidas aqui:
 *   1. CEAP detalhado (despesas + top fornecedores + recibos)
 *   2. Comissões / órgãos do parlamentar (proxy folha do gabinete)
 *   3. Eventos / agenda oficial (proxy presença + viagens)
 *
 * Camadas que NÃO estão aqui (motivo):
 *   - TSE patrimônio: não há fonte pública estável com CORS
 *   - PNCP contratos: precisa coleta + cruzamento por CNPJ (Onda 8)
 *   - Emendas LOA: GCS path emendas_pix/ vazio (Onda 8)
 */

import { useEffect, useState } from "react";

const API_BASE = "https://dadosabertos.camara.leg.br/api/v2";
const ANO_ATUAL = new Date().getFullYear();

// Cache em memória (escopo do tab) — chave: nomeFn|id|ano
const cache = new Map();

async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    const e = new Error(`API Câmara ${res.status} em ${url}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// =============================================================================
// 1. CEAP detalhado — usa /deputados/{id}/despesas
// =============================================================================

/**
 * Lista despesas CEAP do parlamentar e agrega top fornecedores + categorias.
 * Por padrão pega o ano corrente; aceita override via parâmetro.
 */
export function useCEAPDetalhado(id, ano = ANO_ATUAL) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    despesas: [],
    topFornecedores: [],
    topCategorias: [],
    totalAno: 0,
    qtdNotas: 0,
  });

  useEffect(() => {
    if (!id) return;
    const cacheKey = `ceap|${id}|${ano}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }

    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        // Pega até 200 notas (2 páginas) para ter material rico
        const [p1, p2] = await Promise.all([
          fetchJSON(
            `${API_BASE}/deputados/${id}/despesas?ano=${ano}&itens=100&pagina=1&ordem=DESC&ordenarPor=valorLiquido`,
            ctrl.signal,
          ),
          fetchJSON(
            `${API_BASE}/deputados/${id}/despesas?ano=${ano}&itens=100&pagina=2&ordem=DESC&ordenarPor=valorLiquido`,
            ctrl.signal,
          ).catch(() => ({ dados: [] })),
        ]);
        const despesas = [...(p1.dados || []), ...(p2.dados || [])];

        // Agregar top fornecedores
        const fornMap = new Map();
        const catMap = new Map();
        let total = 0;
        for (const d of despesas) {
          const v = Number(d.valorLiquido) || 0;
          total += v;
          const key =
            (d.cnpjCpfFornecedor || "—") + "|" + (d.nomeFornecedor || "—");
          const f = fornMap.get(key) || {
            nome: d.nomeFornecedor || "—",
            cnpj: d.cnpjCpfFornecedor || "—",
            valor: 0,
            qtd: 0,
            categoria: d.tipoDespesa,
          };
          f.valor += v;
          f.qtd += 1;
          fornMap.set(key, f);

          const cat = d.tipoDespesa || "OUTROS";
          const c = catMap.get(cat) || { categoria: cat, valor: 0, qtd: 0 };
          c.valor += v;
          c.qtd += 1;
          catMap.set(cat, c);
        }
        const topFornecedores = [...fornMap.values()]
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 8);
        const topCategorias = [...catMap.values()]
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 8);

        const next = {
          loading: false,
          error: null,
          despesas,
          topFornecedores,
          topCategorias,
          totalAno: total,
          qtdNotas: despesas.length,
          ano,
        };
        cache.set(cacheKey, next);
        if (!ctrl.signal.aborted) setState(next);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({
          loading: false,
          error: e.message || "Falha ao consultar API Câmara",
          despesas: [],
          topFornecedores: [],
          topCategorias: [],
          totalAno: 0,
          qtdNotas: 0,
        });
      }
    })();

    return () => ctrl.abort();
  }, [id, ano]);

  return state;
}

// =============================================================================
// 2. Comissões / órgãos (proxy folha do gabinete)
// =============================================================================

export function useComissoesParlamentar(id) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    orgaos: [],
    titularidades: 0,
    membroDe: 0,
  });

  useEffect(() => {
    if (!id) return;
    const cacheKey = `org|${id}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }

    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetchJSON(
          `${API_BASE}/deputados/${id}/orgaos?itens=100&ordem=DESC&ordenarPor=dataInicio`,
          ctrl.signal,
        );
        const orgaos = (res.dados || []).map((o) => ({
          id: o.idOrgao,
          sigla: o.siglaOrgao,
          nome: o.nomeOrgao,
          titulo: o.titulo,
          dataInicio: o.dataInicio,
          dataFim: o.dataFim,
          ativo: !o.dataFim,
        }));
        const titularidades = orgaos.filter((o) =>
          /titular|presidente|relator|secret/i.test(o.titulo || ""),
        ).length;
        const ativos = orgaos.filter((o) => o.ativo).length;

        const next = {
          loading: false,
          error: null,
          orgaos,
          titularidades,
          membroDe: orgaos.length,
          ativos,
        };
        cache.set(cacheKey, next);
        if (!ctrl.signal.aborted) setState(next);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({
          loading: false,
          error: e.message,
          orgaos: [],
          titularidades: 0,
          membroDe: 0,
        });
      }
    })();

    return () => ctrl.abort();
  }, [id]);

  return state;
}

// =============================================================================
// 3. Eventos / agenda oficial (proxy presença + viagens)
// =============================================================================

export function useEventosParlamentar(id) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    eventos: [],
    proximos: [],
    realizados: [],
    porTipo: [],
  });

  useEffect(() => {
    if (!id) return;
    const cacheKey = `evt|${id}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }

    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetchJSON(
          `${API_BASE}/deputados/${id}/eventos?itens=50&ordem=DESC&ordenarPor=dataHoraInicio`,
          ctrl.signal,
        );
        const eventos = (res.dados || []).map((e) => ({
          id: e.id,
          tipo: e.descricaoTipo,
          descricao: e.descricao,
          local: e.localExterno || e.localCamara?.nome || "—",
          situacao: e.situacao,
          dataInicio: e.dataHoraInicio,
          dataFim: e.dataHoraFim,
        }));

        const agora = Date.now();
        const proximos = eventos
          .filter((e) => new Date(e.dataInicio).getTime() > agora)
          .sort(
            (a, b) =>
              new Date(a.dataInicio).getTime() - new Date(b.dataInicio).getTime(),
          )
          .slice(0, 5);
        const realizados = eventos
          .filter((e) => new Date(e.dataInicio).getTime() <= agora)
          .slice(0, 10);

        const tipoMap = new Map();
        for (const e of eventos) {
          const k = e.tipo || "Outro";
          tipoMap.set(k, (tipoMap.get(k) || 0) + 1);
        }
        const porTipo = [...tipoMap.entries()]
          .map(([tipo, qtd]) => ({ tipo, qtd }))
          .sort((a, b) => b.qtd - a.qtd);

        const next = {
          loading: false,
          error: null,
          eventos,
          proximos,
          realizados,
          porTipo,
        };
        cache.set(cacheKey, next);
        if (!ctrl.signal.aborted) setState(next);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({
          loading: false,
          error: e.message,
          eventos: [],
          proximos: [],
          realizados: [],
          porTipo: [],
        });
      }
    })();

    return () => ctrl.abort();
  }, [id]);

  return state;
}

// =============================================================================
// 4. Status global da plataforma — usa CF getSprintStatus existente
// =============================================================================

const SPRINT_URL =
  "https://southamerica-east1-transparenciabr.cloudfunctions.net/getSprintStatus";

export function usePlataformaStatus() {
  const [state, setState] = useState({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    const cacheKey = "sprint|global";
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const data = await fetchJSON(SPRINT_URL, ctrl.signal);
        const next = { loading: false, error: null, data };
        cache.set(cacheKey, next);
        if (!ctrl.signal.aborted) setState(next);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({ loading: false, error: e.message, data: null });
      }
    })();
    return () => ctrl.abort();
  }, []);

  return state;
}
