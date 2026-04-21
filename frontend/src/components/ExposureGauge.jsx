/**
 * Medidor radial (0–100) — nível de exposição (Motor Forense · estilo cyber-pristine).
 */
export default function ExposureGauge({ value = 0 }) {
  const v = Math.min(100, Math.max(0, Number(value)));
  const radius = 76;
  const cx = 100;
  const cy = 96;

  function polarPoint(angle) {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }

  function arcPath(a0, a1) {
    const p0 = polarPoint(a0);
    const p1 = polarPoint(a1);
    const delta = a1 - a0;
    const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${p0.x} ${p0.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${p1.x} ${p1.y}`;
  }

  const start = Math.PI;
  const endFull = Math.PI * 2;
  const endVal = Math.PI + (v / 100) * Math.PI;

  const bgTrack = arcPath(start, endFull);
  const valueArc = arcPath(start, endVal);

  const gid = `gauge-cyber-${Math.round(v)}`;

  return (
    <div className="relative flex h-full min-h-[220px] w-full flex-col items-center justify-center px-2">
      <svg
        viewBox="0 0 200 122"
        className="w-[min(100%,300px)] drop-shadow-[0_0_40px_rgba(125,211,252,0.35)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${gid}-track`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>
          <linearGradient id={`${gid}-val`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="35%" stopColor="#FDBA74" />
            <stop offset="55%" stopColor="#4ADE80" />
            <stop offset="100%" stopColor="#7DD3FC" />
          </linearGradient>
          <filter id={`${gid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={bgTrack}
          fill="none"
          stroke={`url(#${gid}-track)`}
          strokeWidth="14"
          strokeLinecap="round"
        />

        <path
          d={valueArc}
          fill="none"
          stroke={`url(#${gid}-val)`}
          strokeWidth="14"
          strokeLinecap="round"
          filter={`url(#${gid}-soft)`}
        />
      </svg>

      <div className="pointer-events-none absolute bottom-5 flex flex-col items-center">
        <span className="font-data text-[2.75rem] font-semibold leading-none tabular-nums tracking-tight text-[#7DD3FC] drop-shadow-[0_0_24px_rgba(125,211,252,0.55)]">
          {v.toFixed(1)}
        </span>
        <span className="mt-2 text-center text-[10px] font-semibold uppercase tracking-[0.32em] text-[#8B949E]">
          Nível de exposição
          <span className="block pt-0.5 font-sans text-[11px] font-medium normal-case tracking-normal text-[#A1A7B3]">
            Motor Forense TransparênciaBR
          </span>
        </span>
      </div>
    </div>
  );
}
