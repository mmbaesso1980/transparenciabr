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
        "flex min-h-[11rem] flex-col rounded-xl border bg-[#050608] p-5 shadow-inner sm:min-h-[12rem]",
        alertPulse
          ? "animate-[prisma-pulse_1.4s_ease-in-out_infinite] border-[#f85149]"
          : "border-[#2d0808]",
      ].join(" ")}
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#f85149] md:text-sm">
        {label}
      </p>
      <p className="mt-1 text-xs uppercase tracking-wider text-[#6e7681] md:text-sm">{subtitle}</p>
      <div className="mt-4 flex-1 text-lg leading-relaxed text-[#C9D1D9]">{children}</div>
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
        const chi = r?.chi2_pearson_aprox ?? prismas?.BENFORD?.resultado?.chi2_pearson_aprox;
        return (
          <AgenteCard key={key} label={label} subtitle={subtitle} alertPulse={anomaly}>
            <div className="flex flex-col gap-3">
              {anomaly ? (
                <p className="text-xl font-bold uppercase tracking-wide text-[#f85149] md:text-2xl">
                  ALERTA FORENSE
                </p>
              ) : (
                <p className="text-lg text-[#8B949E] md:text-xl">
                  Sem anomalia Benford destacada nesta amostra (MAD).
                </p>
              )}
              <div className="rounded-lg border border-[#30363D] bg-[#0d1117]/90 px-4 py-3">
                <p className="font-data text-[10px] font-semibold uppercase tracking-widest text-[#8B949E]">
                  MAD (1.º dígito)
                </p>
                <p className="font-data mt-1 text-4xl font-bold tabular-nums text-[#7DD3FC] md:text-5xl">
                  {mad != null ? String(mad) : "—"}
                </p>
              </div>
              <p className="font-data text-sm text-[#8B949E] md:text-base">
                χ² ≈ {chi != null ? String(chi) : "—"} · Amostra:{" "}
                {ok === false ? "insuficiente" : ok === true ? "ok" : "—"}
              </p>
            </div>
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
          <p className="text-lg text-[#8B949E] md:text-xl">
            {waiting
              ? "[AGUARDANDO VARREDURA PROFUNDA]"
              : String(payload?.nota || status || "—")}
          </p>
        </AgenteCard>
      );
    });
  }, [bundle, benfordAgent, prismas]);

  return (
    <div className="space-y-5">
      <style>{`
        @keyframes prisma-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(248, 81, 73, 0.35); }
          50% { box-shadow: 0 0 14px 2px rgba(248, 81, 73, 0.55); }
        }
      `}</style>
      <div className="border-b border-[#2d0808] pb-4">
        <h2 className="text-2xl font-bold tracking-tight text-[#f85149] md:text-3xl">
          A.S.M.O.D.E.U.S. · 12 Prismas
        </h2>
        <p className="mt-2 text-lg leading-relaxed text-[#8B949E]">
          Motor CEAP Node —{" "}
          <span className="font-mono text-[#C9D1D9]">
            {bundle?.gerado_em ? String(bundle.gerado_em).slice(0, 19) : "—"}
          </span>
        </p>
      </div>
      {!bundle ? (
        <p className="rounded-xl border border-[#2d0808] bg-[#050608] p-6 text-lg leading-relaxed text-[#8B949E]">
          Execute <span className="font-mono text-[#f85149]">node engines/ceap_motor.js</span> para
          popular os prismas.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards}
        </div>
      )}
    </div>
  );
}
