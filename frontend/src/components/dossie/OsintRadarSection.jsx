import { CheckCircle2, Radio, ShieldAlert, XCircle } from "lucide-react";

function statusMeta(status) {
  const s = String(status || "").toUpperCase();
  if (s.includes("FAKE")) {
    return {
      label: "FAKE NEWS DESMASCARADA",
      icon: XCircle,
      cls: "border-[#4ADE80]/35 bg-[#4ADE80]/10 text-[#86efac]",
    };
  }
  if (s.includes("FATO")) {
    return {
      label: "FATO CONFIRMADO PELO MOTOR",
      icon: CheckCircle2,
      cls: "border-[#f85149]/40 bg-[#f85149]/10 text-[#fecaca]",
    };
  }
  return {
    label: "EM OBSERVACAO",
    icon: ShieldAlert,
    cls: "border-[#facc15]/40 bg-[#facc15]/10 text-[#fde68a]",
  };
}

export default function OsintRadarSection({ osint = [] }) {
  const rows = Array.isArray(osint) ? osint : [];
  return (
    <section className="glass-card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-[#58A6FF]" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Radar OSINT — Fato ou Fake
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              ASIMODEUS-012 coleta sinais; ASIMODEUS-004 valida antes de publicar.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/60 px-4 py-6 text-center text-xs text-[#8B949E]">
            Nenhum boato validado pelo Compliance para este dossiê.
          </div>
        ) : (
          rows.map((item, idx) => {
            const meta = statusMeta(item.status);
            const Icon = meta.icon;
            return (
              <article
                key={`${item.titulo || item.boato || "osint"}-${idx}`}
                className="rounded-xl border border-[#30363D] bg-[#0D1117]/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${meta.cls}`}>
                    <Icon className="size-3.5" aria-hidden />
                    {meta.label}
                  </span>
                  <span className="font-data text-[10px] text-[#484F58]">
                    Compliance: {item.compliance?.aprovado ? "aprovado" : "veto/pendente"}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[#F0F4FC]">
                  {item.titulo || item.boato || "Sinal OSINT"}
                </h3>
                {item.resumo ? (
                  <p className="mt-2 text-xs leading-relaxed text-[#C9D1D9]">{item.resumo}</p>
                ) : null}
                <div className="mt-3 rounded-lg border border-[#21262D] bg-[#010409]/50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
                    Prova fria
                  </p>
                  <p className="mt-1 text-xs text-[#C9D1D9]">
                    {item.prova || "Sem prova financeira publicada; sinal bloqueado pelo Compliance."}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
