/**
 * @file useFornecedorEnriquecido.js
 * @description Onda 7 — Cruzamento. Hooks que enriquecem fornecedores CEAP
 * (vindos da Câmara ou Senado) com dados públicos:
 *
 *   1. BrasilAPI/CNPJ — razão social, atividade, endereço (CORS aberto, free)
 *   2. PNCP — contratos públicos do mesmo CNPJ (CORS aberto, sem chave)
 *
 * O objetivo investigativo: se um fornecedor pago via CEAP TAMBÉM tem
 * contratos públicos, isso é um sinal de cruzamento que merece atenção.
 * Apresentamos fatos — o leitor tira a conclusão.
 */

import { useEffect, useState } from "react";

const BRASILAPI_CNPJ = "https://brasilapi.com.br/api/cnpj/v1";
const PNCP_BASE = "https://pncp.gov.br/api/consulta/v1";

const cache = new Map();

function cleanCNPJ(cnpj) {
  if (!cnpj) return "";
  return String(cnpj).replace(/\D/g, "").padStart(14, "0").slice(-14);
}

// =============================================================================
// 1. Razão social + atividade — BrasilAPI
// =============================================================================

export function useCNPJDetalhe(cnpjRaw) {
  const cnpj = cleanCNPJ(cnpjRaw);
  const [state, setState] = useState({ loading: !!cnpj, error: null, data: null });

  useEffect(() => {
    if (!cnpj || cnpj.length !== 14) {
      setState({ loading: false, error: null, data: null });
      return;
    }
    const cacheKey = `cnpj|${cnpj}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }
    const ctrl = new AbortController();
    setState({ loading: true, error: null, data: null });
    (async () => {
      try {
        const res = await fetch(`${BRASILAPI_CNPJ}/${cnpj}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) {
          // 404 = CNPJ não encontrado (não é erro; é dado em si)
          const result = { loading: false, error: null, data: null, notFound: res.status === 404 };
          cache.set(cacheKey, result);
          setState(result);
          return;
        }
        const raw = await res.json();
        const data = {
          cnpj: raw.cnpj,
          razaoSocial: raw.razao_social,
          nomeFantasia: raw.nome_fantasia,
          atividadePrincipal: raw.cnae_fiscal_descricao,
          codigoAtividade: raw.cnae_fiscal,
          natureza: raw.natureza_juridica,
          situacao: raw.descricao_situacao_cadastral,
          dataAbertura: raw.data_inicio_atividade,
          uf: raw.uf,
          municipio: raw.municipio,
          capital: raw.capital_social,
          porte: raw.porte,
        };
        const result = { loading: false, error: null, data };
        cache.set(cacheKey, result);
        setState(result);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({ loading: false, error: e.message, data: null });
      }
    })();
    return () => ctrl.abort();
  }, [cnpj]);

  return state;
}

// =============================================================================
// 2. PNCP — contratos públicos por CNPJ de fornecedor
//    Endpoint: /contratos com cnpjFornecedor (lista contratos onde este CNPJ
//    foi o vencedor). Período obrigatório: dataInicial e dataFinal (formato YYYYMMDD).
// =============================================================================

export function usePNCPPorCNPJ(cnpjRaw, anoInicial = null, anoFinal = null) {
  const cnpj = cleanCNPJ(cnpjRaw);
  const yIni = anoInicial || new Date().getFullYear() - 2;
  const yFim = anoFinal || new Date().getFullYear();
  const [state, setState] = useState({
    loading: !!cnpj,
    error: null,
    contratos: [],
    valorTotal: 0,
    qtdContratos: 0,
  });

  useEffect(() => {
    if (!cnpj || cnpj.length !== 14) {
      setState({ loading: false, error: null, contratos: [], valorTotal: 0, qtdContratos: 0 });
      return;
    }
    const cacheKey = `pncp|${cnpj}|${yIni}|${yFim}`;
    if (cache.has(cacheKey)) {
      setState(cache.get(cacheKey));
      return;
    }
    const ctrl = new AbortController();
    setState({ loading: true, error: null, contratos: [], valorTotal: 0, qtdContratos: 0 });
    (async () => {
      try {
        const dataInicial = `${yIni}0101`;
        const dataFinal = `${yFim}1231`;
        // PNCP exige paginação; pegamos até 3 páginas
        const all = [];
        for (let pagina = 1; pagina <= 3; pagina++) {
          const url =
            `${PNCP_BASE}/contratos?dataInicial=${dataInicial}` +
            `&dataFinal=${dataFinal}&cnpjFornecedor=${cnpj}` +
            `&pagina=${pagina}&tamanhoPagina=50`;
          const res = await fetch(url, { signal: ctrl.signal });
          if (!res.ok) break;
          const page = await res.json();
          const items = page?.data || [];
          all.push(...items);
          const totalPaginas = page?.totalPaginas || 1;
          if (pagina >= totalPaginas) break;
        }
        const contratos = all.map((c) => ({
          numero: c.numeroControlePNCP || c.numeroContratoEmpenho,
          objeto: c.objetoContrato,
          valor: parseFloat(c.valorInicial) || 0,
          orgao: c.orgaoEntidade?.razaoSocial,
          cnpjOrgao: c.orgaoEntidade?.cnpj,
          uf: c.unidadeOrgao?.ufSigla,
          municipio: c.unidadeOrgao?.municipioNome,
          dataAssinatura: c.dataAssinatura,
          dataVigenciaFim: c.dataVigenciaFim,
        }));

        const valorTotal = contratos.reduce((a, b) => a + b.valor, 0);
        const result = {
          loading: false,
          error: null,
          contratos,
          valorTotal,
          qtdContratos: contratos.length,
        };
        cache.set(cacheKey, result);
        setState(result);
      } catch (e) {
        if (e.name === "AbortError") return;
        setState({
          loading: false,
          error: e.message,
          contratos: [],
          valorTotal: 0,
          qtdContratos: 0,
        });
      }
    })();
    return () => ctrl.abort();
  }, [cnpj, yIni, yFim]);

  return state;
}
