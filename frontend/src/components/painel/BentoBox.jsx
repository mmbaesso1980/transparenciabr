import React from "react";

function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function riskLabel(score) {
  if (!Number.isFinite(score)) return "Sem score";
  if (score >= 70) return "Risco alto";
  if (score >= 40) return "Risco médio";
  return "Risco baixo";
}

function riskTone(score) {
  if (!Number.isFinite(score)) return "bg-white/10 text-white/70 border-white/20";
  if (score >= 70) return "bg-red-500/15 text-red-300 border-red-400/35";
  if (score >= 40) return "bg-amber-500/15 text-amber-300 border-amber-400/35";
  return "bg-emerald-500/15 text-emerald-300 border-emerald-400/35";
}

export default function BentoBox({ politico, onClick }) {
  const score = Number(politico?.score || 0);
  const foto = politico?.foto || null;
  const nome = politico?.nome || "Parlamentar";
  const partido = politico?.partido || "—";
  const uf = politico?.uf || "—";
  const cargoLabel =
    politico?.cargo === "senador" ? "Senador" : "Deputado Federal";

  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1324] p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-300/45 hover:shadow-[0_10px_28px_-12px_rgba(56,189,248,0.45)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-300/5 via-transparent to-violet-400/5 opacity-0 transition group-hover:opacity-100" />
      <div className="relative z-10 flex items-start gap-3">
        {foto ? (
          <img
            src={foto}
            alt={nome}
            className="h-14 w-14 flex-shrink-0 rounded-xl object-cover ring-1 ring-white/15"
            loading="lazy"
          />
        ) : (
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-white/75 ring-1 ring-white/15">
            {initials(nome)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{nome}</p>
          <p className="mt-0.5 text-[11px] text-white/55">
            {partido}/{uf} · {cargoLabel}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-cyan-200/80">
            {politico?.agente || "Aurora Agent"}
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/45">
            Score Aurora
          </p>
          <p className="text-2xl font-semibold tabular-nums text-white">
            {Math.round(score)}
            <span className="text-xs text-white/50">/100</span>
          </p>
        </div>
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${riskTone(score)}`}
        >
          {riskLabel(score)}
        </span>
      </div>
    </button>
  );
}