import { ChevronDown, ExternalLink, Lock, Receipt } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
 *     urlDocumento?: string,
 *     rawValue?: number,
 *   }>,
 *   resumo?: Record<string, unknown> | null,
 * }} props
 */
export default function CeapMonitorSection({
  investigations = [],
  resumo = null,
  ceapResumo = null,
  godMode = false,
  onUnlockAll,
}) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (godMode) setExpanded(true);
  }, [godMode]);

  const summary = resumo ?? ceapResumo;
  const total = summary?.total_ceap ?? summary?.valor_total_contratos;
  const documentos = summary?.documentos ?? summary?.total_contratos;
  const fornecedores = summary?.fornecedores_distintos;
  const periodo = summary?.periodo;

  const visibleRows =
    expanded || godMode ? investigations : investigations.slice(0, 3);
  const showLoadMore =
    investigations.length > 3 && !(expanded || godMode);

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
    return top.map((item, idx) => ({
      ...item,
      pct: item.value / grand,
      color: ["#f85149", "#f97316", "#facc15", "#58A6FF", "#a371f7", "#4ade80"][idx % 6],
    }));
  }, [investigations]);

  const barMax = useMemo(() => {
    const m = Math.max(...categorySlices.map((s) => s.value), 0);
    return m > 0 ? m : 1;
  }, [categorySlices]);

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
      {summary ? (
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
        <div className="border-b border-[#21262D] px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
            Resumo de gastos por categoria
          </p>
          <div className="flex h-20 min-w-0 items-end gap-1.5">
            {categorySlices.map((slice) => {
              const maxPx = 72;
              const hPx = Math.max(4, Math.round((slice.value / barMax) * maxPx));
              return (
                <div
                  key={slice.label}
                  className="flex min-h-0 min-w-0 flex-1 flex-col justify-end"
                  title={`${slice.label}: ${fmtBrl(slice.value)}`}
                >
                  <div
                    className="w-full max-w-[3.25rem] rounded-t-md mx-auto"
                    style={{
                      height: hPx,
                      backgroundColor: slice.color,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <details className="group mt-2">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium text-[#8B949E] marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden />
              Detalhe por categoria (legenda)
            </summary>
            <ul className="mt-2 grid max-h-24 gap-1 overflow-y-auto text-[11px]">
              {categorySlices.map((slice) => (
                <li key={slice.label} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
                    <span className="truncate text-[#C9D1D9]">{slice.label}</span>
                  </span>
                  <span className="shrink-0 font-data text-[#8B949E]">
                    {Math.round(slice.pct * 100)}% · {fmtBrl(slice.value)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
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
                  Ver nota oficial (Câmara)
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
      {showLoadMore ? (
        <div className="border-t border-[#21262D] px-4 py-3">
          <button
            type="button"
            onClick={() => {
              Promise.resolve(onUnlockAll?.()).then(() => setExpanded(true)).catch(() => {});
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#a371f7]/45 bg-[#a371f7]/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-[#F0F4FC] hover:bg-[#a371f7]/16"
          >
            <Lock className="size-3.5" aria-hidden />
            Clique aqui para carregar todas as notas
          </button>
        </div>
      ) : null}
      {!showLoadMore && !godMode && investigations.length > 3 && expanded ? (
        <div className="border-t border-[#21262D] px-4 py-2">
          <p className="text-center text-[10px] text-[#484F58]">
            Lista completa carregada ({investigations.length} notas).
          </p>
        </div>
      ) : null}
    </section>
  );
}
