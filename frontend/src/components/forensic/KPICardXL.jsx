/**
 * Card XL para hero de dados — label pequeno, valor grande, footnote (fonte).
 * Passe o valor como `children` (ex.: AnimatedNumber ou texto formatado).
 */

const ACCENT = {
  cyan: { border: "rgba(34, 211, 238, 0.35)", glow: "rgba(34, 211, 238, 0.12)", text: "#22d3ee" },
  green: { border: "rgba(16, 185, 129, 0.4)", glow: "rgba(16, 185, 129, 0.1)", text: "#34d399" },
  yellow: { border: "rgba(250, 204, 21, 0.35)", glow: "rgba(250, 204, 21, 0.08)", text: "#facc15" },
  orange: { border: "rgba(251, 146, 60, 0.4)", glow: "rgba(251, 146, 60, 0.1)", text: "#fb923c" },
  red: { border: "rgba(239, 68, 68, 0.45)", glow: "rgba(239, 68, 68, 0.12)", text: "#f87171" },
  gold: { border: "rgba(212, 175, 55, 0.4)", glow: "rgba(212, 175, 55, 0.1)", text: "#d4af37" },
};

export default function KPICardXL({
  label,
  children,
  footnote,
  accent = "cyan",
  trend,
  ariaLabel,
  className = "",
}) {
  const palette = ACCENT[accent] || ACCENT.cyan;

  return (
    <article
      className={`relative flex min-h-[9.5rem] flex-col justify-between rounded-2xl border bg-[#111827]/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
      style={{
        borderColor: palette.border,
        boxShadow: `0 0 0 1px ${palette.glow}, 0 18px 40px rgba(0,0,0,0.35)`,
      }}
      aria-label={ariaLabel}
    >
      <div>
        <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          {label}
        </h3>
        <div
          className="mt-3 font-mono text-4xl font-bold tabular-nums tracking-tight sm:text-5xl"
          style={{ color: palette.text }}
        >
          {children}
        </div>
        {trend ? (
          <p className="mt-2 font-mono text-[11px] font-medium text-slate-500">{trend}</p>
        ) : null}
      </div>
      {footnote ? (
        <p className="mt-3 border-t border-white/[0.06] pt-2 font-mono text-[10px] leading-snug text-slate-500">
          {footnote}
        </p>
      ) : null}
    </article>
  );
}
