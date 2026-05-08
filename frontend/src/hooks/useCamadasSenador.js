/**
 * @file useCamadasSenador.js
 * @description Onda 7 (continuação) — Despertar dos Bancos · trilha Senado.
 *
 * Hooks client-side para senadores brasileiros, consumindo:
 *   - API oficial Senado: legis.senado.leg.br/dadosabertos (CORS aberto)
 *   - API Codante (proxy comunitário do Senado para CEAPS): apis.codante.io
 *
 * Camadas vivas servidas aqui:
 *   1. Detalhe do senador (perfil, mandato, partido, UF, foto)
 *   2. Comissões / órgãos (proxy "folha" do gabinete)
 *   3. CEAPS detalhado via Codante (top fornecedores + categorias)
 *
 * Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos denúncia
 * — apresentamos fatos." Cada número aqui é auditável abrindo a URL no browser.
 */

import { useEffect, useState } from "react";

const SENADO_BASE = "https://legis.senado.leg.br/dadosabertos";
const CODANTE_BASE = "https://apis.codante.io/senator-expenses";
const ANO_ATUAL = new Date().getFullYear();

const cache = new Map();

async function fetchJSON(url, signal) {
  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) {
    const e = new Error(`API Senado/Codante ${res.status} em ${url}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

// =============================================================================
// 1. Detalhe do senador — /senador/{id}.json
// =============================================================================

export function useSenadorDetalhe(id) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    senador: null,
  });

  useEffect(() => {
    if (!id) return;
    const cacheKey = `senador-detalhe|${id}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }
    const ctrl = new AbortController();
    setState({ loading: true, error: null, senador: null });
    (async () => {
      try {
        const data = await fetchJSON(`${SENADO_BASE}/senador/${id}.json`, ctrl.signal);
        const parlamentar =
          data?.DetalheParlamentar?.Parlamentar ||
          data?.Parlamentar ||
          null;

        const mandato = parlamentar?.Mandato || null;
        const ident = parlamentar?.IdentificacaoParlamentar || {};

        const result = {
          loading: false,
          error: null,
          senador: parlamentar
            ? {
                codigo: ident.CodigoParlamentar,
                nome: ident.NomeParlamentar || ident.NomeCompletoParlamentar,
                nomeCompleto: ident.NomeCompletoParlamentar,
                partido: ident.SiglaPartidoParlamentar,
                uf: ident.UfParlamentar,
                sexo: ident.SexoParlamentar,
                foto: ident.UrlFotoParlamentar,
                email: ident.EmailParlamentar,
                website: ident.UrlPaginaParlamentar,
                mandato: mandato
                  ? {
                      titular: mandato.DescricaoParticipacao,
                      uf: mandato.UfParlamentar,
                      legislatura: mandato.PrimeiraLegislaturaDoMandato?.NumeroLegislatura,
                    }
                  : null,
                raw: parlamentar,
              }
            : null,
        };
        cache.set(cacheKey, result);
        setState(result);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({ loading: false, error: e.message, senador: null });
      }
    })();
    return () => ctrl.abort();
  }, [id]);

  return state;
}

// =============================================================================
// 2. Comissões / órgãos do senador — /senador/{id}/comissoes.json
// =============================================================================

export function useSenadorComissoes(id) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    comissoes: [],
    cargosRelevo: [],
    totalComissoes: 0,
  });

  useEffect(() => {
    if (!id) return;
    const cacheKey = `senador-comissoes|${id}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }
    const ctrl = new AbortController();
    setState({ loading: true, error: null, comissoes: [], cargosRelevo: [], totalComissoes: 0 });
    (async () => {
      try {
        const data = await fetchJSON(
          `${SENADO_BASE}/senador/${id}/comissoes.json`,
          ctrl.signal,
        );
        // Estrutura herdada de SOAP: MembroComissaoParlamentar.Parlamentar.MembroComissoes.Comissao
        const lista =
          data?.MembroComissaoParlamentar?.Parlamentar?.MembroComissoes?.Comissao ||
          [];
        const arr = Array.isArray(lista) ? lista : [lista];

        const comissoes = arr
          .filter((c) => c && c.IdentificacaoComissao)
          .map((c) => ({
            sigla: c.IdentificacaoComissao?.SiglaComissao,
            nome: c.IdentificacaoComissao?.NomeComissao,
            cargo: c.DescricaoParticipacao || "Membro",
            inicio: c.DataInicio,
            fim: c.DataFim,
            ativo: !c.DataFim || new Date(c.DataFim) > new Date(),
          }));

        const cargosRelevo = comissoes.filter((c) =>
          /Presidente|Vice|Relator|Líder/i.test(c.cargo || ""),
        );

        const result = {
          loading: false,
          error: null,
          comissoes,
          cargosRelevo,
          totalComissoes: comissoes.length,
        };
        cache.set(cacheKey, result);
        setState(result);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({
          loading: false,
          error: e.message,
          comissoes: [],
          cargosRelevo: [],
          totalComissoes: 0,
        });
      }
    })();
    return () => ctrl.abort();
  }, [id]);

  return state;
}

// =============================================================================
// 3. CEAPS senador via Codante — apis.codante.io/senator-expenses
// =============================================================================

export function useCEAPSenadorCodante(id, ano = ANO_ATUAL) {
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
    const cacheKey = `ceap-senador|${id}|${ano}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }
    const ctrl = new AbortController();
    setState({
      loading: true,
      error: null,
      despesas: [],
      topFornecedores: [],
      topCategorias: [],
      totalAno: 0,
      qtdNotas: 0,
    });
    (async () => {
      try {
        // Codante paginate: pega até 5 páginas (500 itens)
        const all = [];
        let page = 1;
        const MAX_PAGES = 5;
        while (page <= MAX_PAGES) {
          const data = await fetchJSON(
            `${CODANTE_BASE}/senators/${id}/expenses?year=${ano}&page=${page}&per_page=100`,
            ctrl.signal,
          );
          const items = data?.data || [];
          all.push(...items);
          const lastPage = data?.meta?.last_page || 1;
          if (page >= lastPage) break;
          page += 1;
        }

        const despesas = all.map((d) => ({
          data: d.date,
          valor: parseFloat(d.amount) || 0,
          fornecedor: d.supplier,
          cnpj: d.supplier_document,
          categoria: d.expense_category,
        }));

        const fornecedoresMap = new Map();
        const categoriasMap = new Map();
        let totalAno = 0;

        for (const d of despesas) {
          totalAno += d.valor;
          const fornKey = d.cnpj || d.fornecedor || "DESCONHECIDO";
          const fornCur = fornecedoresMap.get(fornKey) || {
            fornecedor: d.fornecedor,
            cnpj: d.cnpj,
            valor: 0,
            qtd: 0,
          };
          fornCur.valor += d.valor;
          fornCur.qtd += 1;
          fornecedoresMap.set(fornKey, fornCur);

          const catCur = categoriasMap.get(d.categoria) || { categoria: d.categoria, valor: 0, qtd: 0 };
          catCur.valor += d.valor;
          catCur.qtd += 1;
          categoriasMap.set(d.categoria, catCur);
        }

        const topFornecedores = Array.from(fornecedoresMap.values())
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10);
        const topCategorias = Array.from(categoriasMap.values())
          .sort((a, b) => b.valor - a.valor)
          .slice(0, 10);

        const result = {
          loading: false,
          error: null,
          despesas,
          topFornecedores,
          topCategorias,
          totalAno,
          qtdNotas: despesas.length,
        };
        cache.set(cacheKey, result);
        setState(result);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({
          loading: false,
          error: e.message,
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
