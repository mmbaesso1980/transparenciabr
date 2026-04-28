import { useMemo } from "react";

/**
 * Ordem tática dos 12 agentes A.S.M.O.D.E.U.S. (UI).
 * Dados: `record.investigacao_prisma_ceap` (motor Node `ceap_motor.js`).
 */
const PRISMAS_ORDER = [
  { key: "BENFORD", label: "BENFORD", subtitle: "Estatística · Lei de Benford" },
  { key: "ORACULO", label: "ORÁCULO", subtitle: "Semântica · Gemini" },
  { key: "SANGUE_PODER", label: "SANGUE E PODER", subtitle: "Nepotismo · QSA" },
  { key: "FLAVIO", label: "F.L.A.V.I.O.", subtitle: "Logística · agenda" },
  { key: "DRACULA", label: "D.R.A.C.U.L.A.", subtitle: "Saúde · CNAE / ANVISA" },
  { key: "ESPECTRO", label: "E.S.P.E.C.T.R.O.", subtitle: "Coerência legislativa" },
  { key: "ARIMA", label: "ARIMA", subtitle: "Anomalias temporais" },
  { key: "KMEANS", label: "K-MEANS", subtitle: "Clusters de risco" },
  { key: "DOC_AI", label: "DOC-AI", subtitle: "OCR forense" },
  { key: "SANKEY", label: "SANKEY", subtitle: "Fluxo · subcontratações" },
  { key: "IRONMAN", label: "I.R.O.N.M.A.N.", subtitle: "Fundamentação legal" },
  { key: "VISUAL", label: "VISUAL", subtitle: "Rede 3D · InstancedMesh" },
];

function AgenteCard({ label, subtitle, children, alertPulse }) {
  return (
    <div
      className={[
        "flex min-h-[7.5rem] flex-col rounded-lg border bg-[#050608] p-3 shadow-inner",
        alertPulse
          ? "animate-[prisma-pulse_1.4s_ease-in-out_infinite] border-[#f85149]"
          : "border-[#2d0808]",
      ].join(" ")}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f85149]">
        {label}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[#6e7681]">{subtitle}</p>
      <div className="mt-2 flex-1 text-[11px] leading-snug text-[#C9D1D9]">{children}</div>
    </div>
  );
}

/**
 * @param {{ record?: Record<string, unknown> | null }} props
 */
export default function PrismaCeapSection({ record }) {
  const bundle = record?.investigacao_prisma_ceap;
  const prismas = bundle?.prismas;
  const benfordAgent = bundle?.benford_agente;

  const cards = useMemo(() => {
    return PRISMAS_ORDER.map(({ key, label, subtitle }) => {
      if (key === "BENFORD") {
        const r = benfordAgent ?? prismas?.BENFORD?.resultado;
        const anomaly =
          r?.anomaly_detected === true ||
          r?.alerta_forense === true ||
          Boolean(prismas?.BENFORD?.resultado?.anomaly_detected);
        const mad = r?.mad ?? prismas?.BENFORD?.resultado?.mad;
        const ok = r?.amostra_suficiente ?? prismas?.BENFORD?.resultado?.amostra_suficiente;
        return (
          <AgenteCard key={key} label={label} subtitle={subtitle} alertPulse={anomaly}>
            {anomaly ? (
              <p className="font-semibold uppercase tracking-wide text-[#f85149]">
                ALERTA FORENSE
              </p>
            ) : (
              <p className="text-[#8B949E]">Sem anomalia Benford flagrada (MAD).</p>
            )}
            <p className="mt-2 font-mono text-[10px] text-[#8B949E]">
              MAD: {mad != null ? String(mad) : "—"} · Amostra:{" "}
              {ok === false ? "insuficiente" : ok === true ? "ok" : "—"}
            </p>
          </AgenteCard>
        );
      }

      const payload = prismas?.[key];
      const status = payload?.status ?? payload?.nota;
      const waiting =
        !status ||
        String(status).includes("aguardando") ||
        String(payload?.nota || "").includes("AGUARDANDO");
      return (
        <AgenteCard key={key} label={label} subtitle={subtitle}>
          <p className="text-[#8B949E]">
            {waiting
              ? "[AGUARDANDO VARREDURA PROFUNDA]"
              : String(payload?.nota || status || "—")}
          </p>
        </AgenteCard>
      );
    });
  }, [bundle, benfordAgent, prismas]);

  return (
    <div className="space-y-3">
      <style>{`
        @keyframes prisma-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0.35); }
          50% { box-shadow: 0 0 14px 2px rgba(248, 81, 73, 0.55); }
        }
      `}</style>
      <div className="border-b border-[#2d0808] pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#f85149]">
          A.S.M.O.D.E.U.S. · 12 Prismas
        </p>
        <p className="text-[10px] text-[#6e7681]">
          Motor CEAP Node —{" "}
          <span className="font-mono text-[#C9D1D9]">
            {bundle?.gerado_em ? String(bundle.gerado_em).slice(0, 19) : "—"}
          </span>
        </p>
      </div>
      {!bundle ? (
        <p className="rounded-lg border border-[#2d0808] bg-[#050608] p-4 text-sm text-[#8B949E]">
          Execute <span className="font-mono text-[#f85149]">node engines/ceap_motor.js</span> para
          popular os prismas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards}
        </div>
      )}
    </div>
  );
}
