/** Barras horizontais — comparação (ex.: notas por ano). */
export default function ForensicBarChartH({
  rows,
  labelKey = "label",
  valueKey = "value",
  valueFormatter,
  className = "",
}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#0b0f1a]/80 p-8 text-sm text-slate-500 ${className}`}
      >
        Sem dados para o gráfico.
      </div>
    );
  }

  const vals = list.map((r) => Number(r[valueKey]) || 0);
  const maxV = Math.max(...vals, 1);
  const fmt = valueFormatter || ((n) => String(n));

  return (
    <div className={`w-full space-y-2.5 ${className}`} role="list">
      {list.map((r) => {
        const lab = String(r[labelKey] ?? "");
        const v = Number(r[valueKey]) || 0;
        const pct = (v / maxV) * 100;
        return (
          <div key={lab} className="flex items-center gap-3" role="listitem">
            <span className="w-14 shrink-0 font-mono text-[11px] text-slate-500">{lab}</span>
            <div className="relative h-7 min-w-0 flex-1 overflow-hidden rounded-md bg-[#1e293b]/80">
              <div
                className="h-full rounded-md bg-gradient-to-r from-[#22d3ee]/80 to-[#0891b2]/90 transition-[width] duration-500"
                style={{ width: `${pct}%`, minWidth: v > 0 ? "6px" : 0 }}
              />
            </div>
            <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">
              {fmt(v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
