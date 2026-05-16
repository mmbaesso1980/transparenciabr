/**
 * Linha única na fila de alertas forenses do dossiê.
 * @param {{ alert: { codigo?: string; tipo: string; severidade?: string; trecho: string; fonte_primaria?: string; resumo_forense?: string }; index?: number }} props
 */
export default function AlertRow({ alert }) {
  const a = alert;
  return (
    <li className="border-b border-[#21262D] py-3 last:border-b-0">
      <div className="flex gap-3">
        <span
          className="select-none text-lg leading-snug text-[#f85149]"
          aria-hidden="true"
        >
          ●
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {a.codigo ? (
              <span className="rounded border border-[#7DD3FC]/35 bg-[#7DD3FC]/10 px-2 py-0.5 font-data text-[10px] font-semibold uppercase tracking-wide text-[#7DD3FC]">
                {a.codigo}
              </span>
            ) : null}
            <span className="rounded bg-[#21262D] px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-[#f85149]">
              {a.tipo}
            </span>
            {a.severidade ? (
              <span className="text-[10px] uppercase tracking-wider text-[#8B949E]">
                {a.severidade}
              </span>
            ) : null}
          </div>
          {a.fonte_primaria ? (
            <p className="mt-1 font-data text-[11px] text-[#58A6FF]">{a.fonte_primaria}</p>
          ) : null}
          {a.resumo_forense ? (
            <p className="mt-1 text-sm italic leading-relaxed text-[#8B949E]">{a.resumo_forense}</p>
          ) : null}
          <p className="mt-2 text-lg leading-relaxed text-[#C9D1D9]">{a.trecho}</p>
        </div>
      </div>
    </li>
  );
}
