/**
 * usePainelData — Single source of truth dos dados do Painel.
 *
 * 07/05 manhã: 100% mock.
 * 07/05 tarde (este arquivo): `parlamentares` puxa REAL do Firestore via
 *   useParlamentares(); demais blocos seguem mock até as fontes BQ entrarem.
 *
 * Estratégia de fallback:
 *   - Se Firestore retorna lista válida → usa real.
 *   - Se loading/erro → cai no mock (usuário não fica com tela vazia).
 *
 * Cada bento do Painel deriva tabelas do array `parlamentares` (cota, frugalidade,
 * sinalizações, score). Substituindo essa única fonte, todos os 17 bentos passam
 * a navegar para `/dossie/:id` com IDs REAIS.
 */

import { useMemo } from "react";
import * as mock from "../components/painel/mockData";
import { useParlamentares } from "./useParlamentares.js";

/** Deriva ranking ordenado por chave. */
function topBy(arr, key, n = 50, dir = "desc") {
  const sign = dir === "desc" ? -1 : 1;
  return [...arr].sort((a, b) => sign * (Number(a?.[key] || 0) - Number(b?.[key] || 0))).slice(0, n);
}

export function usePainelData() {
  const { data: parlReal, isLoading, isError } = useParlamentares();

  // Fonte primária: real se disponível, senão mock.
  const parlamentares = useMemo(() => {
    if (Array.isArray(parlReal) && parlReal.length > 0) return parlReal;
    return mock.parlamentares ?? [];
  }, [parlReal]);

  // Rankings derivados — sempre a partir de `parlamentares` (real ou mock).
  const maioresCotas = useMemo(() => topBy(parlamentares, "cota", 50, "desc"), [parlamentares]);
  const maisFrugais = useMemo(() => topBy(parlamentares, "frugalidade", 50, "desc"), [parlamentares]);
  const sinalizacoesSOC = useMemo(() => topBy(parlamentares, "sinalizacoes", 50, "desc"), [parlamentares]);

  return {
    loading: isLoading,
    error: isError,
    realDataSource: Array.isArray(parlReal) && parlReal.length > 0,

    // Top-level fonte real
    parlamentares,
    maioresCotas,
    maisFrugais,
    sinalizacoesSOC,

    // Demais blocos seguem mock (a serem migrados conforme dados BQ chegam)
    pontuacaoBrasil: mock.pontuacaoBrasil,
    mapaUF: mock.mapaUF,
    pulsoCEAP: mock.pulsoCEAP,
    mataUF: mock.mataUF,
    emendasCriticas: mock.emendasCriticas,
    contratosPNCP: mock.contratosPNCP,
    radarJuridico: mock.radarJuridico,
    meuUniverso: mock.meuUniverso,
    influenciaSetorial: mock.influenciaSetorial,
    atividadeLegislativa: mock.atividadeLegislativa,
    promessaEntrega: mock.promessaEntrega,
    pulsoFederal: mock.pulsoFederal,
    redeEmpresarial: mock.redeEmpresarial,
    aberturaOrgao: mock.aberturaOrgao,
    headerInfo: mock.headerInfo,
  };
}
