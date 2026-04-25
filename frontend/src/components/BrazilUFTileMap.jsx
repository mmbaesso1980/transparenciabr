import { getRiskHex } from "../utils/colorUtils.js";

/** Ordem visual aproximada (N→S, E→W) para grelha 9×3 + DF. */
const UF_ORDER = [
  "RR",
  "AP",
  "AM",
  "PA",
  "AC",
  "RO",
  "TO",
  "MA",
  "PI",
  "CE",
  "RN",
  "PB",
  "PE",
  "AL",
  "SE",
  "BA",
  "MG",
  "ES",
  "RJ",
  "SP",
  "PR",
  "SC",
  "RS",
  "MS",
  "MT",
  "GO",
  "DF",
];

function scoreFromCount(count, maxCount) {
  const c = Number(count) || 0;
  const m = Math.max(Number(maxCount) || 0, 1);
  return Math.min(100, Math.round((c / m) * 100));
}

/**
 * Cartograma simples por UF — intensidade derivada da contagem de alertas.
 *
 * @param {{
 *   ufCounts: Record<string, number>;
 *   selectedUf?: string | null;
 *   onSelectUf?: (uf: string | null) => void;
 * }} props
 */
export default function BrazilUFTileMap({
  ufCounts,
  selectedUf = null,
  onSelectUf,
}) {
  const entries = UF_ORDER.map((uf) => [uf, ufCounts?.[uf] ?? 0]);
  const maxCount = Math.max(1, ...entries.map(([, n]) => n));

  return (
    <div className="w-full max-w-5xl">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 md:grid-cols-9 md:gap-1.5">
        {entries.map(([uf, count]) => {
          const score = scoreFromCount(count, maxCount);
          const bg =
            count === 0 ? "rgba(33,38,45,0.95)" : getRiskHex(score || 8);
          const active = selectedUf === uf;
          return (
            <button
              key={uf}
              type="button"
              aria-pressed={active}
              title={`${uf}: ${count} alerta(s)`}
              className={[
                "relative flex aspect-square max-h-16 flex-col items-center justify-center rounded-md border text-[11px] font-semibold uppercase tracking-wide transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58A6FF]",
                active
                  ? "border-[#58A6FF] shadow-[0_0_0_2px_rgba(88,166,255,0.35)]"
                  : "border-[#30363D]",
              ].join(" ")}
              style={{
                backgroundColor: bg,
                color: count === 0 ? "#8B949E" : "#080B14",
              }}
              onClick={() => {
                if (!onSelectUf) return;
                if (selectedUf === uf) onSelectUf(null);
                else onSelectUf(uf);
              }}
            >
              <span>{uf}</span>
              <span className="mt-0.5 font-mono text-[10px] opacity-90">
                {count}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[#8B949E]">
        Cores HSL por intensidade relativa ao pico neste conjunto de alertas. Estados sem vínculo UF no
        perfil do político ficam ausentes da soma.
      </p>
    </div>
  );
}
