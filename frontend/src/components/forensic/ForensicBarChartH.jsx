/** Barras horizontais — comparação (ex.: notas por ano ou valor por categoria). */
export default function ForensicBarChartH({
  rows,
  labelKey = "label",
  valueKey = "value",
  titleKey = "labelTitle",
  valueFormatter,
  className = "",
  compact = false,
  maxRows,
  emptyMessage = "Sem dados para o gráfico.",
}) {
  const raw = Array.isArray(rows) ? rows : [];
  const list = typeof maxRows === "number" ? raw.slice(0, maxRows) : raw;
  if (list.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#0b0f1a]/80 p-8 text-sm text-slate-500 ${className}`}
      >
        {emptyMessage}
      </div>
    );
  }

  const vals = list.map((r) => Number(r[valueKey]) || 0);
  const maxV = Math.max(...vals, 1);
  const fmt = valueFormatter || ((n) => String(n));
  const labelClass = compact
    ? "max-w-[min(11rem,42vw)] shrink-0 truncate font-mono text-[10px] text-slate-500"
    : "w-14 shrink-0 font-mono text-[11px] text-slate-500";
  const barH = compact ? "h-5" : "h-7";
  const valW = compact ? "w-20" : "w-24";

  return (
    <div className={`w-full space-y-2 ${compact ? "space-y-1.5" : "space-y-2.5"} ${className}`} role="list">
      {list.map((r, idx) => {
        const lab = String(r[labelKey] ?? "");
        const title = r[titleKey] != null ? String(r[titleKey]) : lab;
        const v = Number(r[valueKey]) || 0;
        const pct = (v / maxV) * 100;
        return (
          <div key={`${idx}-${lab}`} className="flex items-center gap-2 sm:gap-3" role="listitem">
            <span className={labelClass} title={title}>
              {lab}
            </span>
            <div className={`relative ${barH} min-w-0 flex-1 overflow-hidden rounded-md bg-[#1e293b]/80`}>
              <div
                className="h-full rounded-md bg-gradient-to-r from-[#22d3ee]/80 to-[#0891b2]/90 transition-[width] duration-500"
                style={{ width: `${pct}%`, minWidth: v > 0 ? "6px" : 0 }}
              />
            </div>
            <span
              className={`${valW} shrink-0 text-right font-mono text-[10px] tabular-nums text-slate-300 sm:text-[11px]`}
            >
              {fmt(v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
