import { Radar, Share2 } from "lucide-react";

import CommercialOpportunitySection from "./CommercialOpportunitySection.jsx";
import NetworkGraph from "./NetworkGraph.jsx";
import PremiumDossierSection from "./PremiumDossierSection.jsx";

/**
 * Laboratório premium — PDF, insights e teia preditiva (dentro do paywall).
 */
export default function OracleLaboratory({
  pdfError,
  pdfBusy,
  onDownloadPdf,
  displayRecord,
  politicoId,
  nomeExibicao,
  graphPayload,
}) {
  return (
    <div className="oracle-laboratory space-y-4">
      {pdfError ? (
        <div
          role="alert"
          className="rounded-xl border border-[#f85149]/55 bg-[#f85149]/12 px-4 py-3 text-base leading-relaxed text-[#ffa198]"
        >
          <span className="font-semibold text-[#F0F4FC]">PDF:</span> {pdfError}
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={pdfBusy}
          onClick={() => void onDownloadPdf()}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[#7DD3FC]/45 bg-[#7DD3FC]/10 px-6 py-3.5 text-base font-semibold tracking-tight text-[#7DD3FC] shadow-[0_0_24px_rgba(125,211,252,0.12)] transition hover:bg-[#7DD3FC]/18 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7DD3FC] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span aria-hidden="true">📄</span>
          {pdfBusy ? "A gerar PDF…" : "Baixar Dossiê Forense (PDF)"}
        </button>
      </div>

      <PremiumDossierSection record={displayRecord} />

      <div className="glass-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
          <div className="flex items-center gap-2">
            <Share2 className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
            <h3 className="text-xl font-bold tracking-tight text-[#F0F4FC] md:text-2xl">
              Teia preditiva — Análise Forense
            </h3>
          </div>
          <Radar className="size-4 text-[#484F58]" />
        </div>
        <div className="flex min-h-[280px] min-w-0 flex-col overflow-x-auto p-2 sm:min-h-[300px]">
          <NetworkGraph
            politicianId={politicoId}
            embedded
            graphPayload={graphPayload}
            centralLabel={nomeExibicao || ""}
          />
        </div>
      </div>

      <CommercialOpportunitySection politico={displayRecord} />
    </div>
  );
}
