import { Helmet } from "react-helmet-async";

import DossieDataGate from "../components/dossie/DossieDataGate.jsx";
import DossieHeader from "../components/dossie/DossieHeader.jsx";
import DossieMainSections from "../components/dossie/DossieMainSections.jsx";
import DossiePDFContent from "../components/dossie/DossiePDFContent.jsx";
import IdentitySection from "../components/dossie/IdentitySection.jsx";
import { useDossieData } from "../hooks/useDossieData.js";

export default function DossiePage() {
  const d = useDossieData();
  const scrollPremium = () =>
    document.getElementById("dossie-premium-cta")?.scrollIntoView({ behavior: "smooth" });

  return (
    <DossieDataGate loading={d.loading} error={d.error}>
      <>
        <Helmet>
          <title>{d.pageTitle}</title>
          <meta name="description" content={d.metaDesc} />
          <meta property="og:title" content={d.pageTitle} />
          <meta property="og:description" content={d.metaDesc} />
          {d.photoAbs ? <meta property="og:image" content={d.photoAbs} /> : null}
          <meta property="og:type" content="article" />
        </Helmet>

        <div className="relative isolate min-h-full w-full min-w-0 max-w-full overflow-x-hidden bg-[#0B0F1A] pb-12 text-[#F0F4FC]">
          <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
            <div className="absolute -left-[18%] -top-[12%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(253,224,71,0.38)_0%,transparent_68%)] blur-3xl opacity-10" />
            <div className="absolute -right-[12%] top-[28%] h-[26rem] w-[26rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(74,222,128,0.38)_0%,transparent_68%)] blur-3xl opacity-10" />
            <div className="absolute bottom-[-14%] left-[22%] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(125,211,252,0.42)_0%,transparent_68%)] blur-3xl opacity-10" />
          </div>

          <div className="relative z-10 min-w-0 w-full max-w-full">
            <IdentitySection
              nomeExibicao={d.nomeExibicao}
              partidoSigla={d.partidoSigla}
              uf={d.uf}
              photoAbs={d.photoAbs}
              politicoId={d.politicoId}
              snapshotOrigem={d.displayRecord?.snapshot_origem}
              riskValue={d.riskValue}
              ceapKpi={d.ceapKpi}
              credits={d.credits}
              onScrollPremium={scrollPremium}
              onInvestigationComplete={d.refetchReport}
            />

            <DossieHeader
              photoAbs={d.photoAbs}
              nomeExibicao={d.nomeExibicao}
              partidoSigla={d.partidoSigla}
              displayRecordId={d.displayRecord?.id}
              politicoId={d.politicoId}
              monitoringActive={d.monitoringActive}
              onToggleMonitor={d.handleToggleMonitor}
              credits={d.credits}
            />

            <DossieMainSections dossie={d} />

            <DossiePDFContent
              ref={d.pdfRef}
              politico={d.displayRecord}
              alertas={d.alerts}
              ceapKpi={d.ceapKpi}
            />
          </div>
        </div>
      </>
    </DossieDataGate>
  );
}
