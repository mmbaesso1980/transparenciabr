import { Compass } from "lucide-react";
import { useMemo } from "react";

/**
 * Normaliza para [-1, 1]. Aceita escalas -1..1, 0..100 (50=centro) ou 0..1.
 */
function normalizeAxis(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  if (n >= -1 && n <= 1) return Math.max(-1, Math.min(1, n));
  if (n >= 0 && n <= 1) return n * 2 - 1;
  if (n >= 0 && n <= 100) return Math.max(-1, Math.min(1, (n - 50) / 50));
  return Math.max(-1, Math.min(1, n / 100));
}

/** Posição estável quando `espectro_politico` ainda não veio do pipeline. */
function fallbackFromPoliticoId(politico) {
  const raw =
    politico?.id ??
    politico?.nome ??
    politico?.nome_completo ??
    politico?.CodigoParlamentar ??
    "default";
  const s = String(raw);
  let a = 2166136261 >>> 0;
  let b = 374761393 >>> 0;
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 16777619);
    b = Math.imul(b ^ s.charCodeAt(i) * (i + 3), 2654435761);
  }
  const u1 = (a >>> 0) / 4294967295;
  const u2 = (b >>> 0) / 4294967295;
  return {
    economia: u1 * 2 - 1,
    costumes: u2 * 2 - 1,
    fallback: true,
  };
}

function parseEspectroFromDoc(politico) {
  const esp = politico?.espectro_politico;
  if (!esp || typeof esp !== "object") return null;

  const econRaw =
    esp.economia ??
    esp.eixo_economico ??
    esp.eixoEconomico ??
    esp.left_right ??
    esp.economic_axis;
  const socRaw =
    esp.costumes ??
    esp.eixo_social ??
    esp.eixoSocial ??
    esp.conservative_progressive ??
    esp.social_axis;

  if (econRaw == null && socRaw == null) return null;

  return {
    economia: normalizeAxis(econRaw ?? 50),
    costumes: normalizeAxis(socRaw ?? 50),
    fallback: false,
  };
}

function fmtAxisLabel(v) {
  const x = Math.max(-1, Math.min(1, v));
  return x.toFixed(2);
}

/**
 * Plano 2D: X = economia (esquerda→direita), Y = costumes (conservador→progressista).
 *
 * @param {{ politico?: Record<string, unknown> | null }} props
 */
export default function BussolaPolitica({ politico = null }) {
  const { economia, costumes, isFallback } = useMemo(() => {
    const parsed = parseEspectroFromDoc(politico);
    if (parsed) {
      return {
        economia: parsed.economia,
        costumes: parsed.costumes,
        isFallback: parsed.fallback,
      };
    }
    const fb = fallbackFromPoliticoId(politico);
    return {
      economia: fb.economia,
      costumes: fb.costumes,
      isFallback: true,
    };
  }, [politico]);

  const px = ((economia + 1) / 2) * 100;
  const py = ((1 - costumes) / 2) * 100;

  return (
    <div className="flex h-full min-h-[200px] w-full flex-col px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Compass className="size-4 shrink-0 text-[#58A6FF]" strokeWidth={1.75} aria-hidden />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#8B949E]">
            E.S.P.E.C.T.R.O.
          </p>
          <p className="truncate text-xs font-medium text-[#C9D1D9]">
            Bússola política
          </p>
        </div>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-[220px] flex-1">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full overflow-visible"
          aria-label="Mapa ideológico: economia e costumes"
        >
          <defs>
            <radialGradient id="spectro-glow" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="rgba(88,166,255,0.14)" />
              <stop offset="100%" stopColor="rgba(8,11,20,0)" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#spectro-glow)" rx="8" />
          <rect
            x="4"
            y="4"
            width="92"
            height="92"
            fill="none"
            stroke="#30363D"
            strokeWidth="0.8"
            rx="6"
          />
          <line x1="50" y1="8" x2="50" y2="92" stroke="#21262D" strokeWidth="0.6" />
          <line x1="8" y1="50" x2="92" y2="50" stroke="#21262D" strokeWidth="0.6" />

          <circle cx={px} cy={py} r="5.5" fill="#f85149" stroke="#FECACA" strokeWidth="1.2" />
          <circle cx={px} cy={py} r="11" fill="none" stroke="rgba(248,81,73,0.35)" strokeWidth="1" />
        </svg>

        <span className="pointer-events-none absolute left-1 top-1/2 -translate-y-1/2 text-[8px] font-semibold uppercase tracking-tighter text-[#8B949E]">
          Esq.
        </span>
        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[8px] font-semibold uppercase tracking-tighter text-[#8B949E]">
          Dir.
        </span>
        <span className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 text-[8px] font-semibold uppercase tracking-tighter text-[#8B949E]">
          Prog.
        </span>
        <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold uppercase tracking-tighter text-[#8B949E]">
          Cons.
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
        <div className="rounded-md border border-[#21262D] bg-[#161B22]/80 px-2 py-1.5">
          <dt className="text-[#8B949E]">Economia</dt>
          <dd className="font-mono tabular-nums text-[#F0F4FC]">{fmtAxisLabel(economia)}</dd>
        </div>
        <div className="rounded-md border border-[#21262D] bg-[#161B22]/80 px-2 py-1.5">
          <dt className="text-[#8B949E]">Costumes</dt>
          <dd className="font-mono tabular-nums text-[#F0F4FC]">{fmtAxisLabel(costumes)}</dd>
        </div>
      </dl>

      {isFallback ? (
        <p className="mt-2 text-center text-[10px] leading-snug text-[#484F58]">
          Estimativa de referência até classificação forense completa.
        </p>
      ) : null}
    </div>
  );
}
