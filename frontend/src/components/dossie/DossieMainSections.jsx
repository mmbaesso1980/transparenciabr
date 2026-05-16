import {
  AlertTriangle,
  BarChart3,
  Globe,
  Radar,
  Sparkles,
} from "lucide-react";

import BrazilHeatmap from "../BrazilHeatmap.jsx";
import ExposureGauge from "../ExposureGauge.jsx";
import DossieForensicStrip from "../forensic/DossieForensicStrip.jsx";
import AlertRow from "./AlertRow.jsx";
import BussolaPolitica from "./BussolaPolitica.jsx";
import CeapMonitorSection from "./CeapMonitorSection.jsx";
import DiarioSection from "./DiarioSection.jsx";
import DossierPremiumInsights from "./DossierPremiumInsights.jsx";
import EmendasSection from "./EmendasSection.jsx";
import FolhaGabinete from "./FolhaGabinete.jsx";
import GastosCeapSection from "./GastosCeapSection.jsx";
import HealthAuditSection from "./HealthAuditSection.jsx";
import OracleLaboratory from "./OracleLaboratory.jsx";
import OsintCeapCrossSection from "./OsintCeapCrossSection.jsx";
import OsintRadarSection from "./OsintRadarSection.jsx";
import PncpDetalhado from "./PncpDetalhado.jsx";
import PrismaCeapSection from "./PrismaCeapSection.jsx";
import SocioeconomicBaseSection from "./SocioeconomicBaseSection.jsx";
import TsePatrimonio from "./TsePatrimonio.jsx";
import UnlockGate from "./UnlockGate.jsx";
import ViagensPedagios from "./ViagensPedagios.jsx";
import { ORACLE_LABORATORIO_CREDITS } from "../../constants/dossieConstants.js";

/**
 * Corpo principal do dossiê (entre cabeçalho sticky e o PDF oculto).
 * @param {{ dossie: Record<string, unknown> }} props
 */
export default function DossieMainSections({ dossie: d }) {
  return (
    <div className="dossie-page-body mx-auto min-w-0 w-full max-w-[1600px] space-y-6 px-4 pt-6 sm:px-6 text-lg leading-relaxed text-[#C9D1D9]">
      <DossieForensicStrip kpi={d.ceapKpi} politicoId={d.politicoId} loading={d.ceapKpiLoading} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Indicadores forenses em destaque">
        {d.bentoBoxes.map((b) => (
          <div
            key={b.k}
            className="rounded-2xl border border-[#30363D]/80 bg-[#111827]/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">{b.k}</p>
            <p className="mt-2 font-mono text-xl font-bold text-[#58A6FF]">{b.v}</p>
            <p className="mt-1 text-[11px] text-[#6e7681]">{b.sub}</p>
          </div>
        ))}
      </section>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <section className="glass-card flex min-h-[26rem] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
            <div className="flex items-center gap-2">
              <Radar className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
                  Motor Forense TransparênciaBR
                </h2>
                <p className="mt-1 text-lg leading-relaxed text-[#8B949E]">
                  Nível de exposição (índice agregado no documento)
                </p>
              </div>
            </div>
          </div>
          <div className="flex min-h-[14rem] flex-1 items-center justify-center px-2 py-4">
            {d.riskValue != null ? (
              <ExposureGauge value={d.riskValue} />
            ) : (
              <p className="text-center text-lg leading-relaxed text-[#8B949E]">
                Índice de exposição indisponível neste registo.
              </p>
            )}
          </div>
        </section>

        <section className="glass-card relative flex min-h-[26rem] flex-col overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-[#FDBA74]" strokeWidth={1.75} />
              <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
                Espectro político (Bússola)
              </h2>
            </div>
            <Sparkles className="size-4 text-[#FDE047]" />
          </div>
          <div className="flex min-h-[14rem] flex-1 items-stretch justify-center overflow-hidden px-2 py-4">
            <BussolaPolitica politico={d.displayRecord} />
          </div>
        </section>
      </div>

      <GastosCeapSection
        record={d.displayRecord}
        godMode={d.godMode}
        oracleUnlocked={d.oracleUnlocked}
        onRequestUnlock={d.handleOraclePay}
      />

      <section className="glass-card overflow-hidden bg-[#050608] p-4 ring-1 ring-[#2d0808]/80 sm:p-5">
        <PrismaCeapSection record={d.displayRecord} politicoId={d.politicoId} />
      </section>

      <section className="mx-auto min-w-0 max-w-[1600px] px-0">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Sparkles className="size-5 text-[#FDE047]" strokeWidth={1.75} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
              Painel premium — inteligência consolidada
            </h2>
            <p className="mt-1 text-lg leading-relaxed text-[#8B949E]">
              Resumo de riscos, fornecedores CEAP e hipóteses de cruzamento (OSS × CNES).
            </p>
          </div>
        </div>
        <DossierPremiumInsights record={d.displayRecord} />
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        <CeapMonitorSection
          investigations={d.investigations}
          ceapResumo={d.displayRecord?.ceap_resumo}
          godMode={d.godMode}
          oracleUnlocked={d.oracleUnlocked}
          onUnlockAll={d.handleOraclePay}
        />
        <DiarioSection politico={d.displayRecord} />
        <SocioeconomicBaseSection politico={d.displayRecord} variant="bento" />
      </div>

      <section className="glass-card overflow-hidden p-4 sm:p-5">
        <EmendasSection politico={d.displayRecord} showPageHeading />
      </section>

      <div className="grid gap-4 lg:grid-cols-12">
        <section className="glass-card col-span-12 flex min-h-[22rem] flex-col overflow-hidden p-0 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
            <div className="flex items-center gap-2">
              <Globe className="size-4 text-[#4ADE80]" strokeWidth={1.75} />
              <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
                Distribuição geográfica
              </h2>
            </div>
          </div>
          <div className="flex min-h-[18rem] flex-1 flex-col px-2 pb-2 pt-2">
            <BrazilHeatmap
              embedded
              riskScore={d.riskValue ?? undefined}
              municipalityRiskMap={d.municipalityRiskMap}
            />
          </div>
        </section>

        <section className="glass-card col-span-12 flex min-h-[22rem] flex-col overflow-hidden p-0 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-[#f85149]" strokeWidth={1.75} />
              <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
                Alertas recentes
              </h2>
            </div>
          </div>
          <ul className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-3">
            {d.alerts.length === 0 ? (
              <li className="py-8 text-center text-lg leading-relaxed text-[#8B949E]">
                Nenhum alerta cadastrado para este parlamentar na coleção de monitorização.
              </li>
            ) : (
              d.alerts.map((a, idx) => <AlertRow key={`${a.codigo ?? a.tipo}-${idx}`} alert={a} />)
            )}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TsePatrimonio politicoNome={d.displayRecord?.nome} />
        <FolhaGabinete politicoNome={d.displayRecord?.nome} />
        <ViagensPedagios politicoNome={d.displayRecord?.nome} />
        <PncpDetalhado politicoNome={d.displayRecord?.nome} />
      </div>

      <OsintRadarSection osint={d.displayRecord?.osint_radar} />
      <OsintCeapCrossSection items={d.osintCeapCross} />
      <HealthAuditSection politico={d.displayRecord} />

      <div id="dossie-premium-cta" className="min-w-0 scroll-mt-28 pb-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Sparkles className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
              Motor Forense TransparênciaBR — camada premium
            </h2>
            <p className="mt-1 text-lg leading-relaxed text-[#8B949E]">
              Teia 3D preditiva, PDF forense e oportunidades comerciais — débito de{" "}
              <span className="font-data text-[#FDE047]">{ORACLE_LABORATORIO_CREDITS}</span> créditos.
            </p>
          </div>
        </div>
        <UnlockGate
          locked={d.oracleLocked}
          creditsRequired={ORACLE_LABORATORIO_CREDITS}
          currentCredits={d.credits ?? 0}
          creditsLoading={d.creditsLoading}
          godMode={d.godMode}
          onPayCredits={d.handleOraclePay}
        >
          <OracleLaboratory
            pdfError={d.pdfError}
            pdfBusy={d.pdfBusy}
            onDownloadPdf={d.handleDownloadPDF}
            displayRecord={d.displayRecord}
            politicoId={d.politicoId}
            nomeExibicao={d.nomeExibicao}
            graphPayload={d.graphPayload}
          />
        </UnlockGate>
      </div>
    </div>
  );
}
