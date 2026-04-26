import { doc, getDoc } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";

import { getFirestoreDb } from "../lib/firebase.js";
import { ONE_DAY_MS } from "../lib/queryClient.js";

export const TRANSPARENCY_REPORTS_COLLECTION = "transparency_reports";

/**
 * @typedef {Object} TransparencyReportIdentity
 * @property {string=} cnpj
 * @property {string=} razao_social
 */

/**
 * @typedef {Object} TransparencyReportContract
 * @property {string=} contrato_id
 * @property {string=} objeto
 * @property {number=} valor
 * @property {string=} data_referencia
 */

/**
 * @typedef {Object} KMeansRisk
 * @property {string=} cluster
 * @property {"CRITICO"|"ALTO"|"MEDIO"|string=} nivel_risco
 * @property {number=} valor_total_contratos
 * @property {number=} frequencia_ganhos
 * @property {number=} idade_cnpj_dias
 * @property {number=} distancia_euclidiana
 * @property {string=} avaliado_em
 */

/**
 * @typedef {Object} TemporalAlert
 * @property {string=} data_agrupada
 * @property {number=} soma_gastos
 * @property {number=} upper_bound
 * @property {number=} anomaly_probability
 * @property {"CRITICO"|"ALTO"|"MEDIO"|string=} nivel_risco
 * @property {string=} avaliado_em
 */

/**
 * @typedef {Object} SemanticAudit
 * @property {number=} indice_risco
 * @property {string[]=} fraudes_detectadas
 * @property {string=} resumo_auditoria
 * @property {Array<Record<string, unknown>>=} achados
 * @property {number=} confianca
 */

/**
 * @typedef {Object} TransparencyReport
 * @property {string} id
 * @property {string=} report_id
 * @property {"fornecedor_pncp"|string=} tipo_dossie
 * @property {TransparencyReportIdentity=} identidade
 * @property {{ total_contratos?: number, valor_total_contratos?: number, contratos_relevantes?: TransparencyReportContract[] }=} contratos
 * @property {{ empresas_fachada?: KMeansRisk[], surtos_orcamentarios?: TemporalAlert[] }=} alertas
 * @property {SemanticAudit=} analise_semantica
 * @property {SemanticAudit=} semantic_audit
 * @property {{ sincronizado_em?: unknown, fonte?: string, tabela_contratos?: string, tabela_risco_cnpj?: string, tabela_arima?: string }=} metadados
 */

const RISK_WEIGHTS = {
  CRITICO: 100,
  ALTO: 78,
  MEDIO: 52,
  BAIXO: 24,
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickHighestRisk(risks) {
  return asArray(risks).reduce((best, item) => {
    const level = String(item?.nivel_risco || "").toUpperCase();
    const score = RISK_WEIGHTS[level] ?? 40;
    const prev = best ? (RISK_WEIGHTS[String(best.nivel_risco || "").toUpperCase()] ?? 40) : -1;
    return score > prev ? item : best;
  }, null);
}

function calculateRiskScore(report) {
  const semanticRisk = asNumber(
    report?.analise_semantica?.indice_risco ??
      report?.semantic_audit?.indice_risco,
  );
  const kmeansRisk = pickHighestRisk(report?.alertas?.empresas_fachada);
  const temporalRisk = pickHighestRisk(report?.alertas?.surtos_orcamentarios);
  const kScore = kmeansRisk ? (RISK_WEIGHTS[String(kmeansRisk.nivel_risco || "").toUpperCase()] ?? 40) : 0;
  const tScore = temporalRisk ? (RISK_WEIGHTS[String(temporalRisk.nivel_risco || "").toUpperCase()] ?? 40) : 0;
  const value = asNumber(report?.contratos?.valor_total_contratos);
  const valuePressure = value > 0 ? Math.min(20, Math.log10(value + 1) * 2.5) : 0;
  return Math.max(0, Math.min(100, Math.round(Math.max(semanticRisk, kScore, tScore) + valuePressure)));
}

function fmtBrl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function normalizeAlertRows(report) {
  const semantic = report?.analise_semantica ?? report?.semantic_audit;
  const semanticRows = asArray(semantic?.fraudes_detectadas).slice(0, 12).map((fraud) => ({
    tipo: "GEMINI_AUDITORIA",
    severidade: asNumber(semantic?.indice_risco) >= 80 ? "CRITICO" : "ALTO",
    trecho: String(fraud || semantic?.resumo_auditoria || "Achado semantico").slice(0, 280),
  }));

  const kmeans = asArray(report?.alertas?.empresas_fachada).map((risk) => ({
    tipo: "KMEANS_FORNECEDOR",
    severidade: risk?.nivel_risco || "MEDIO",
    trecho: [
      `Cluster ${risk?.cluster ?? "?"}`,
      `contratos ${fmtBrl(risk?.valor_total_contratos)}`,
      `frequencia ${asNumber(risk?.frequencia_ganhos)}`,
      `idade CNPJ ${asNumber(risk?.idade_cnpj_dias)} dias`,
    ].filter(Boolean).join(" · "),
  }));

  const temporal = asArray(report?.alertas?.surtos_orcamentarios).slice(0, 12).map((alert) => ({
    tipo: "ARIMA_SURTO_TEMPORAL",
    severidade: alert?.nivel_risco || "MEDIO",
    trecho: [
      alert?.data_agrupada ? `Dia ${alert.data_agrupada}` : "",
      `gasto ${fmtBrl(alert?.soma_gastos)}`,
      `limite ${fmtBrl(alert?.upper_bound)}`,
      alert?.anomaly_probability != null
        ? `p=${Number(alert.anomaly_probability).toFixed(3)}`
        : "",
    ].filter(Boolean).join(" · "),
  }));

  return [...semanticRows, ...kmeans, ...temporal];
}

function normalizeInvestigations(report) {
  return asArray(report?.contratos?.contratos_relevantes).map((contract, index) => ({
    ref: contract?.contrato_id || `PNCP-${String(index + 1).padStart(3, "0")}`,
    titulo: contract?.objeto || "Contrato sem objeto resumido",
    foco: contract?.data_referencia || "PNCP",
    valor: asNumber(contract?.valor),
    score: Math.min(100, Math.max(5, Math.log10(asNumber(contract?.valor) + 1) * 8)),
  }));
}

/**
 * Mapeia o JSON da Engine 17 para o formato lido pelas Bento Boxes existentes.
 *
 * @param {TransparencyReport} report
 */
export function mapTransparencyReportToDossieRecord(report) {
  if (!report || typeof report !== "object") return null;
  const razao = report.identidade?.razao_social || "Fornecedor PNCP";
  const cnpj = report.identidade?.cnpj || report.id || "";
  return {
    id: report.id,
    tipo_dossie: report.tipo_dossie,
    nome: razao,
    nome_completo: razao,
    apelido_publico: razao,
    cnpj,
    partido_sigla: "PNCP",
    score_forense: calculateRiskScore(report),
    alertas_anexados: normalizeAlertRows(report),
    investigacoes_top: normalizeInvestigations(report),
    transparency_report: report,
    contratos_pncp: report.contratos,
    alertas_preditivos: report.alertas,
    analise_semantica: report.analise_semantica ?? report.semantic_audit,
    metadados_sync: report.metadados,
  };
}

/**
 * Uma unica leitura pontual: transparency_reports/{reportId}.
 *
 * @param {string} reportId
 * @returns {Promise<TransparencyReport | null>}
 */
export async function fetchTransparencyReportById(reportId) {
  const firestore = getFirestoreDb();
  const cleanId = String(reportId || "").trim();
  if (!firestore || !cleanId) return null;
  const snap = await getDoc(doc(firestore, TRANSPARENCY_REPORTS_COLLECTION, cleanId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export function transparencyReportQueryKey(reportId) {
  return [TRANSPARENCY_REPORTS_COLLECTION, String(reportId || "").trim()];
}

/**
 * Hook de leitura com cache agressivo: uma leitura pontual por dossie a cada 24h.
 */
export function useTransparencyReport(reportId) {
  const cleanId = String(reportId || "").trim();
  return useQuery({
    queryKey: transparencyReportQueryKey(cleanId),
    queryFn: async () => {
      const report = await fetchTransparencyReportById(cleanId);
      return mapTransparencyReportToDossieRecord(report);
    },
    enabled: Boolean(cleanId),
    staleTime: ONE_DAY_MS,
    gcTime: 2 * ONE_DAY_MS,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
}
