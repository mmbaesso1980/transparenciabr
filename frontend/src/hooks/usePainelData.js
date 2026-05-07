/**
 * usePainelData — Single source of truth dos dados do Painel.
 *
 * Liga `parlamentares`, `maioresCotas`, `maisFrugais` ao Firestore real
 * (via useParlamentares). Demais blocos seguem mock até as views BQ
 * correspondentes serem criadas.
 *
 * IMPORTANTE: cada bento espera um SHAPE específico — alguns são arrays,
 * outros são objetos com chaves específicas (ex: SinalizacoesSOC espera
 * {total, feed: [...]}). NÃO sobrescrever cegamente.
 *
 * Estratégia de fallback:
 *   - Real disponível → usa real
 *   - Loading/erro → cai no mock (UX nunca quebra)
 */

import { useMemo } from "react";
import * as mock from "../components/painel/mockData";
import { useParlamentares } from "./useParlamentares.js";

/** Deriva ranking ordenado por chave numérica. Sempre retorna array. */
function topBy(arr, key, n = 50, dir = "desc") {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const sign = dir === "desc" ? -1 : 1;
  return [...arr]
    .sort((a, b) => sign * (Number(a?.[key] || 0) - Number(b?.[key] || 0)))
    .slice(0, n);
}

export function usePainelData() {
  const { data: parlReal, isLoading, isError } = useParlamentares();

  const realDataReady =
    Array.isArray(parlReal) && parlReal.length > 0;

  // Fonte primária dos parlamentares
  const parlamentares = useMemo(() => {
    if (realDataReady) return parlReal;
    return Array.isArray(mock.parlamentares) ? mock.parlamentares : [];
  }, [parlReal, realDataReady]);

  // Rankings derivados — só sobrescrevem o mock quando há dado real;
  // caso contrário, devolve o mock pré-derivado original (que é array de 5).
  const maioresCotas = useMemo(() => {
    if (realDataReady) return topBy(parlamentares, "cota", 50, "desc");
    return Array.isArray(mock.maioresCotas) ? mock.maioresCotas : [];
  }, [parlamentares, realDataReady]);

  const maisFrugais = useMemo(() => {
    if (realDataReady) return topBy(parlamentares, "frugalidade", 50, "desc");
    return Array.isArray(mock.maisFrugais) ? mock.maisFrugais : [];
  }, [parlamentares, realDataReady]);

  return {
    loading: isLoading,
    error: isError,
    realDataSource: realDataReady,

    // Fonte real (fallback mock se loading/erro)
    parlamentares,
    maioresCotas,
    maisFrugais,

    // SinalizacoesSOC NÃO é array — é objeto {total, feed: [...]}.
    // Mantém mock até criarmos hook próprio (TODO).
    sinalizacoesSOC: mock.sinalizacoesSOC,

    // Demais blocos seguem mock (cada um com shape próprio — não tocar)
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
