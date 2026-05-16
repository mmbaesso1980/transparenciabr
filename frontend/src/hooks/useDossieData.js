import html2pdf from "html2pdf.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { ORACLE_LABORATORIO_CREDITS, WATCHLIST_STORAGE_KEY } from "../constants/dossieConstants.js";
import { deductCredits, getFirebaseApp } from "../lib/firebase.js";
import { useTransparencyReport } from "../services/transparencyReports.js";
import {
  absolutizeMediaUrl,
  enrichPoliticoRecord,
  mergeCeapInvestigationRows,
  normalizeAlertRow,
  pickGraphPayload,
  pickNome,
  pickOsintCeapCrossItems,
  pickPhotoUrl,
  pickPartidoSigla,
  pickRiskScore,
  pickUf,
} from "../utils/dataParsers.js";
import {
  dossiePdfFilename,
  oracleStorageKey,
  readWatchlistIdsFromStorage,
} from "../utils/dossieWatchlist.js";
import useDossieCeapKPIs from "./useDossieCeapKPIs.js";
import { useUserClaims } from "./useUserClaims.js";
import { useUserCredits } from "./useUserCredits.js";

export function useDossieData() {
  const { id } = useParams();
  const politicoId = id ?? "";

  const creditsState = useUserCredits();
  const userClaims = useUserClaims();
  const pdfRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [record, setRecord] = useState(null);
  const [oracleUnlocked, setOracleUnlocked] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const reportQuery = useTransparencyReport(politicoId);
  const { data: ceapKpi, loading: ceapKpiLoading } = useDossieCeapKPIs(politicoId);

  const displayRecord = useMemo(() => enrichPoliticoRecord(record), [record]);

  useEffect(() => {
    const pid = politicoId.trim();
    if (!pid) return;
    setMonitoringActive(readWatchlistIdsFromStorage().includes(pid));
  }, [politicoId]);

  const handleToggleMonitor = useCallback(() => {
    const pid = politicoId.trim();
    if (!pid) return;
    const prev = readWatchlistIdsFromStorage();
    const next = monitoringActive ? prev.filter((x) => x !== pid) : [...new Set([...prev, pid])];
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(next));
    setMonitoringActive(!monitoringActive);
  }, [politicoId, monitoringActive]);

  useEffect(() => {
    if (!politicoId.trim()) return;
    try {
      if (sessionStorage.getItem(oracleStorageKey(politicoId.trim())) === "1") {
        setOracleUnlocked(true);
      }
    } catch {
      /* storage indisponível */
    }
  }, [politicoId]);

  const handleOraclePay = useCallback(async () => {
    await deductCredits(ORACLE_LABORATORIO_CREDITS);
    try {
      sessionStorage.setItem(oracleStorageKey(politicoId.trim()), "1");
    } catch {
      /* ignore */
    }
    setOracleUnlocked(true);
  }, [politicoId]);

  const handleDownloadPDF = useCallback(async () => {
    setPdfError(null);
    const el = pdfRef.current;
    if (!el) {
      setPdfError("Conteúdo do relatório PDF não está disponível neste momento.");
      return;
    }
    setPdfBusy(true);
    try {
      const filename = dossiePdfFilename(pickNome(displayRecord));
      await html2pdf()
        .set({
          margin: 10,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#0B0F1A",
            logging: false,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        })
        .from(el)
        .save();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Erro desconhecido ao gerar o PDF.";
      setPdfError(msg);
      console.error("[DossiePage] PDF:", err);
    } finally {
      setPdfBusy(false);
    }
  }, [displayRecord]);

  useEffect(() => {
    if (!politicoId.trim()) {
      setLoading(false);
      setError("missing_id");
      setRecord(null);
      return;
    }

    if (!getFirebaseApp()) {
      setLoading(false);
      setError("missing_config");
      setRecord(null);
      return;
    }

    setLoading(reportQuery.isLoading || reportQuery.isFetching);
    setError(null);

    if (reportQuery.isError) {
      setError(reportQuery.error instanceof Error ? reportQuery.error.message : "fetch_failed");
      setRecord(null);
      setLoading(false);
      return;
    }

    if (reportQuery.isSuccess) {
      if (!reportQuery.data) {
        setError("not_found");
        setRecord(null);
      } else {
        setRecord(reportQuery.data);
      }
      setLoading(false);
    }
  }, [
    politicoId,
    reportQuery.data,
    reportQuery.error,
    reportQuery.isError,
    reportQuery.isFetching,
    reportQuery.isLoading,
    reportQuery.isSuccess,
  ]);

  const nomeExibicao = useMemo(() => pickNome(displayRecord), [displayRecord]);
  const partidoSigla = useMemo(() => pickPartidoSigla(displayRecord), [displayRecord]);
  const uf = useMemo(() => pickUf(displayRecord) || "", [displayRecord]);
  const riskValue = useMemo(() => pickRiskScore(displayRecord), [displayRecord]);
  const photoAbs = useMemo(
    () => absolutizeMediaUrl(pickPhotoUrl(displayRecord)),
    [displayRecord],
  );

  const municipalityRiskMap = useMemo(() => {
    if (!displayRecord || typeof displayRecord !== "object") return undefined;
    const raw =
      displayRecord.mapa_risco_municipal ??
      displayRecord.risco_por_municipio ??
      displayRecord.risco_municipios;
    return raw && typeof raw === "object" ? raw : undefined;
  }, [displayRecord]);

  const graphPayload = useMemo(() => pickGraphPayload(displayRecord), [displayRecord]);

  const investigations = useMemo(
    () => mergeCeapInvestigationRows(displayRecord),
    [displayRecord],
  );

  const osintCeapCross = useMemo(
    () => pickOsintCeapCrossItems(displayRecord),
    [displayRecord],
  );

  const alerts = useMemo(() => {
    const a1 = Array.isArray(displayRecord?.alertas_anexados)
      ? displayRecord.alertas_anexados
      : [];
    const a2 = Array.isArray(displayRecord?.alertas_bodes) ? displayRecord.alertas_bodes : [];
    const merged = [...a2, ...a1];
    return merged.map((r, i) => normalizeAlertRow(r, i)).filter(Boolean);
  }, [displayRecord]);

  const bentoBoxes = useMemo(
    () => [
      {
        k: "Valor CEAP (datalake)",
        v:
          ceapKpi?.valor_total_classificado_brl != null
            ? new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
                maximumFractionDigits: 0,
              }).format(Number(ceapKpi.valor_total_classificado_brl))
            : "—",
        sub: "Soma classificada GCS",
      },
      {
        k: "HHI fornecedores",
        v:
          ceapKpi?.hhi_fornecedores != null
            ? Number(ceapKpi.hhi_fornecedores).toLocaleString("pt-BR", { maximumFractionDigits: 0 })
            : "—",
        sub: "Concentração 0–10000",
      },
      {
        k: "Diversidade (Shannon)",
        v:
          ceapKpi?.diversidade_categorias_shannon_bits != null
            ? `${Number(ceapKpi.diversidade_categorias_shannon_bits).toFixed(2)} bits`
            : "—",
        sub: "Por categoria de gasto",
      },
      {
        k: "Alertas no dossiê",
        v: String(alerts.length),
        sub: "Anexados ao relatório",
      },
    ],
    [ceapKpi, alerts.length],
  );

  const pageTitle = nomeExibicao
    ? riskValue != null
      ? `Dossiê: ${nomeExibicao} · Índice de Risco ${Math.round(Number(riskValue))} | TransparênciaBR`
      : `Dossiê: ${nomeExibicao} | TransparênciaBR`
    : "Dossiê parlamentar | TransparênciaBR";

  const metaDesc =
    nomeExibicao && riskValue != null
      ? `TransparênciaBR — ${nomeExibicao}. Índice de Risco ${Math.round(Number(riskValue))} (dados agregados).`
      : `Painel de transparência e fiscalização — ${nomeExibicao || "parlamentar"}.`;

  const godMode = Boolean(creditsState?.godMode) || Boolean(userClaims?.isGodMode);
  const isPremiumTier = Boolean(userClaims?.isPremium);
  const credits = creditsState?.credits ?? null;
  const oracleLocked = !godMode && !isPremiumTier && !oracleUnlocked;
  const creditsLoading = creditsState === null || userClaims?.loading === true;

  return {
    politicoId,
    pdfRef,
    loading,
    error,
    displayRecord,
    nomeExibicao,
    partidoSigla,
    uf,
    riskValue,
    photoAbs,
    municipalityRiskMap,
    graphPayload,
    investigations,
    osintCeapCross,
    alerts,
    bentoBoxes,
    pageTitle,
    metaDesc,
    ceapKpi,
    ceapKpiLoading,
    creditsState,
    userClaims,
    godMode,
    isPremiumTier,
    credits,
    oracleLocked,
    creditsLoading,
    oracleUnlocked,
    monitoringActive,
    handleToggleMonitor,
    handleOraclePay,
    handleDownloadPDF,
    pdfError,
    pdfBusy,
  };
}
