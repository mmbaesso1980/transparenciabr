/** Série temporal simples — linha + área (SVG), sem dependências. */
export default function ForensicLineChart({
  points,
  valueFormatter,
  height = 160,
  className = "",
}) {
  const list = Array.isArray(points) ? points : [];
  if (list.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border border-white/[0.08] bg-[#0b0f1a]/80 p-8 text-sm text-slate-500 ${className}`}
      >
        Sem série anual disponível.
      </div>
    );
  }

  const vals = list.map((p) => Number(p.valor_brl) || 0);
  const maxV = Math.max(...vals, 1);
  const w = 640;
  const h = height;
  const pad = 28;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const coords = list.map((p, i) => {
    const x = pad + (list.length <= 1 ? innerW / 2 : (i / (list.length - 1)) * innerW);
    const y = pad + innerH - (Number(p.valor_brl) / maxV) * innerH;
    return { x, y, ano: p.ano, v: Number(p.valor_brl) };
  });

  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");
  const areaD = `${d} L${coords[coords.length - 1].x.toFixed(1)},${pad + innerH} L${coords[0].x.toFixed(1)},${pad + innerH} Z`;

  const fmt = valueFormatter || ((n) => String(n));

  return (
    <div className={`w-full ${className}`}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-auto w-full max-h-48"
        role="img"
        aria-label="Gráfico de linha do volume financeiro classificado por ano"
      >
        <defs>
          <linearGradient id="forensic-line-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaD} fill="url(#forensic-line-fill)" />
        <path
          d={d}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {coords.map((c) => (
          <g key={c.ano}>
            <circle cx={c.x} cy={c.y} r="4" fill="#0b0f1a" stroke="#22d3ee" strokeWidth="2" />
            <text
              x={c.x}
              y={h - 6}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {c.ano}
            </text>
            <text
              x={c.x}
              y={c.y - 10}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              {fmt(c.v)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
