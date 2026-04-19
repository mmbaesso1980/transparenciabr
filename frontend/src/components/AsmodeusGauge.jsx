/**
 * Medidor radial (0–100) — índice de exposição consolidado.
 */
export default function AsmodeusGauge({ value = 0 }) {
  const v = Math.min(100, Math.max(0, Number(value)));
  const radius = 72;
  const cx = 100;
  const cy = 96;

  /** Semicírculo superior: ângulos π → 2π (SVG: cos/sen com Y para baixo). */
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

  return (
    <div className="relative flex h-full min-h-[200px] w-full flex-col items-center justify-center px-2">
      <svg
        viewBox="0 0 200 118"
        className="w-[min(100%,280px)] drop-shadow-[0_0_32px_rgba(220,38,38,0.55)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="risk-gauge-glow" x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#450a0a" />
            <stop offset="40%" stopColor="#dc2626" />
            <stop offset="85%" stopColor="#fca5a5" />
            <stop offset="100%" stopColor="#fef2f2" />
          </linearGradient>
          <filter id="risk-gauge-soft" x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          d={bgTrack}
          fill="none"
          stroke="#21262D"
          strokeWidth="13"
          strokeLinecap="round"
        />

        <path
          d={valueArc}
          fill="none"
          stroke="url(#risk-gauge-glow)"
          strokeWidth="13"
          strokeLinecap="round"
          filter="url(#risk-gauge-soft)"
        />
      </svg>

      <div className="pointer-events-none absolute bottom-6 flex flex-col items-center">
        <span className="font-mono text-[2.65rem] font-bold leading-none tabular-nums tracking-tighter text-[#FECACA] drop-shadow-[0_0_22px_rgba(239,68,68,0.9)]">
          {v.toFixed(1)}
        </span>
        <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.32em] text-[#8B949E]">
          exposure index
        </span>
      </div>
    </div>
  );
}
