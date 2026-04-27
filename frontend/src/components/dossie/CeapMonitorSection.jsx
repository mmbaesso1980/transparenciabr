import { ExternalLink, Lock, PieChart, Receipt } from "lucide-react";
import { useMemo, useState } from "react";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

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
 *   resumo?: Record<string, unknown> | null,
 * }} props
 */
export default function CeapMonitorSection({ investigations = [], resumo = null }) {
  const [expanded, setExpanded] = useState(false);
  const total = resumo?.total_ceap ?? resumo?.valor_total_contratos;
  const documentos = resumo?.documentos ?? resumo?.total_contratos;
  const fornecedores = resumo?.fornecedores_distintos;
  const periodo = resumo?.periodo;
  const godMode = Boolean(resumo?.godMode);
  const visibleRows = expanded || godMode ? investigations : investigations.slice(0, 3);
  const hiddenCount = Math.max(0, investigations.length - visibleRows.length);
  const categorySlices = useMemo(() => {
    const totals = new Map();
    for (const row of investigations) {
      const key = String(row.titulo || "Outras despesas").slice(0, 48);
      const value = Number(row.valor ?? row.rawValue ?? 0);
      totals.set(key, (totals.get(key) || 0) + (Number.isFinite(value) ? value : 0));
    }
    const all = [...totals.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
    const top = all.slice(0, 5);
    const rest = all.slice(5).reduce((sum, item) => sum + item.value, 0);
    if (rest > 0) top.push({ label: "Outras", value: rest });
    const grand = top.reduce((sum, item) => sum + item.value, 0) || 1;
    let acc = 0;
    return top.map((item, idx) => {
      const start = acc;
      const pct = item.value / grand;
      acc += pct;
      return {
        ...item,
        pct,
        dash: `${Math.max(0.5, pct * 100)} ${Math.max(0, 100 - pct * 100)}`,
        offset: -start * 100,
        color: ["#f85149", "#f97316", "#facc15", "#58A6FF", "#a371f7", "#4ade80"][idx % 6],
      };
    });
  }, [investigations]);

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
      {resumo ? (
        <div className="grid grid-cols-3 gap-2 border-b border-[#21262D] px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#8B949E]">Total</p>
            <p className="mt-1 font-data text-sm text-[#F0F4FC]">{fmtBrl(total)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#8B949E]">Docs</p>
            <p className="mt-1 font-data text-sm text-[#F0F4FC]">{Number(documentos || 0).toLocaleString("pt-BR")}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-[#8B949E]">Fornec.</p>
            <p className="mt-1 font-data text-sm text-[#F0F4FC]">{Number(fornecedores || 0).toLocaleString("pt-BR")}</p>
          </div>
          {periodo?.startYear ? (
            <p className="col-span-3 font-data text-[10px] text-[#484F58]">
              Série auditada: {periodo.startYear}–{periodo.endYear}
            </p>
          ) : null}
        </div>
      ) : null}
      {categorySlices.length > 0 ? (
        <div className="grid gap-3 border-b border-[#21262D] px-4 py-3 sm:grid-cols-[8rem_1fr]">
          <div className="relative mx-auto size-28">
            <svg viewBox="0 0 42 42" className="size-28 -rotate-90" aria-label="Distribuicao CEAP por categoria">
              <circle cx="21" cy="21" r="15.9" fill="none" stroke="#21262D" strokeWidth="6" />
              {categorySlices.map((slice) => (
                <circle
                  key={slice.label}
                  cx="21"
                  cy="21"
                  r="15.9"
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="6"
                  strokeDasharray={slice.dash}
                  strokeDashoffset={slice.offset}
                />
              ))}
            </svg>
            <PieChart className="absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 text-[#8B949E]" />
          </div>
          <ul className="grid content-center gap-1 text-[11px]">
            {categorySlices.map((slice) => (
              <li key={slice.label} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                  <span className="truncate text-[#C9D1D9]">{slice.label}</span>
                </span>
                <span className="font-data text-[#8B949E]">{Math.round(slice.pct * 100)}%</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ul className="flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto px-4 py-3">
        {investigations.length === 0 ? (
          <li className="py-8 text-center text-xs text-[#8B949E]">
            Nenhuma linha estruturada neste documento.
          </li>
        ) : (
          visibleRows.map((row, idx) => (
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
              {row.urlDocumento ? (
                <a
                  href={row.urlDocumento}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[#30363D] bg-[#21262D]/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#58A6FF] hover:border-[#58A6FF]/50"
                >
                  <ExternalLink className="size-3" aria-hidden />
                  Ver nota fiscal
                </a>
              ) : null}
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
      {hiddenCount > 0 ? (
        <div className="border-t border-[#21262D] px-4 py-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#a371f7]/45 bg-[#a371f7]/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#F0F4FC] hover:bg-[#a371f7]/16"
          >
            {!godMode ? <Lock className="size-3.5" aria-hidden /> : null}
            {godMode
              ? `Ver todas as ${investigations.length} notas fiscais`
              : `Ver todas as notas fiscais e dossie (consome creditos)`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
