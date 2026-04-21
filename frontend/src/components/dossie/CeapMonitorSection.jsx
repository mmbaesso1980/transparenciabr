import { Receipt } from "lucide-react";

/**
 * Monitor CEAP — linhas prioritárias de gasto / investigações estruturadas no documento.
 *
 * @param {{
 *   investigations?: Array<{
 *     ref: string,
 *     titulo: string,
 *     foco: string,
 *     valorLabel: string | null,
 *     progressPct: number | null,
 *   }>,
 * }} props
 */
export default function CeapMonitorSection({ investigations = [] }) {
  return (
    <section className="glass-card flex min-h-[24rem] flex-col overflow-hidden p-0 lg:min-h-[26rem]">
      <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-2">
          <Receipt className="size-4 text-[#a371f7]" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Monitor CEAP — linhas prioritárias
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              O que movimenta o mandato hoje (despesas / linhas estruturadas no documento)
            </p>
          </div>
        </div>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-3">
        {investigations.length === 0 ? (
          <li className="py-8 text-center text-xs text-[#8B949E]">
            Nenhuma linha estruturada neste documento.
          </li>
        ) : (
          investigations.map((row, idx) => (
            <li
              key={`${row.ref}-${idx}`}
              className="border-b border-[#21262D] py-3 last:border-b-0"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-data text-[11px] text-[#7DD3FC]">{row.ref}</p>
                  <p className="mt-1 text-sm font-medium leading-snug text-[#F0F4FC]">
                    {row.titulo}
                  </p>
                  {row.foco ? (
                    <p className="mt-1 text-xs text-[#8B949E]">{row.foco}</p>
                  ) : null}
                </div>
                {row.valorLabel ? (
                  <span className="shrink-0 font-data text-[11px]">
                    {row.valorLabel}
                  </span>
                ) : null}
              </div>
              {row.progressPct != null ? (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#21262D]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#14532d] via-[#22c55e] to-[#fde047]"
                    style={{
                      width: `${Math.min(100, Math.max(0, row.progressPct))}%`,
                    }}
                  />
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
