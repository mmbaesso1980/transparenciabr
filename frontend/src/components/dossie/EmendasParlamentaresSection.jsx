import { Coins, ExternalLink } from "lucide-react";
import { useMemo, useState } from "react";

import {
  FILTROS_EMENDA,
  labelRpForTipo,
  normalizeEmendasList,
  rowMatchesFiltro,
} from "../../utils/emendasNormalize";
import { listarExerciciosLoa } from "../../utils/loaPortalUrls";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** Dados de demonstração quando o documento ainda não traz `emendas_parlamentares`. */
const MOCK_EMENDAS_DEMO = [
  {
    descricao: "Emenda individual — custeio em saúde municipal (RP6)",
    valor: 850_000,
    codigo_rp: "RP6",
  },
  {
    descricao: "Emenda de bancada — infraestrutura e iluminação (RP7)",
    valor: 2_400_000,
    codigo_rp: "RP7",
  },
  {
    descricao: "Transferência via PIX — RP99 (emenda parlamentar)",
    valor: 320_000,
    codigo_rp: "RP99",
  },
  {
    descricao: "Emenda individual — educação e equipamentos (RP6)",
    valor: 1_100_000,
    codigo_rp: "RP6",
  },
];

const PILLS = [
  { id: FILTROS_EMENDA.TODAS, label: "Todas" },
  { id: FILTROS_EMENDA.PIX, label: "PIX (RP99)" },
  { id: FILTROS_EMENDA.INDIVIDUAL, label: "Individuais (RP6)" },
  { id: FILTROS_EMENDA.BANCADA, label: "Bancada (RP7)" },
];

/**
 * @param {{ politico?: Record<string, unknown> | null }} props
 */
export default function EmendasParlamentaresSection({ politico = null }) {
  const [filtro, setFiltro] = useState(FILTROS_EMENDA.TODAS);
  const [anoLoa, setAnoLoa] = useState(2026);
  const exerciciosLoa = useMemo(() => listarExerciciosLoa(), []);
  const loaSel = useMemo(
    () => exerciciosLoa.find((e) => e.ano === anoLoa) ?? exerciciosLoa.at(-1),
    [exerciciosLoa, anoLoa],
  );

  const rows = useMemo(() => {
    const raw =
      politico?.emendas_parlamentares ??
      politico?.emendas ??
      politico?.emendas_orcamento;
    const source = Array.isArray(raw) && raw.length ? raw : MOCK_EMENDAS_DEMO;
    return normalizeEmendasList(source);
  }, [politico]);

  const filtradas = useMemo(
    () => rows.filter((r) => rowMatchesFiltro(filtro, r)),
    [rows, filtro],
  );

  const total = useMemo(
    () =>
      filtradas.reduce((acc, r) => acc + (Number(r.valor_normalizado) || 0), 0),
    [filtradas],
  );

  return (
    <section className="glass dashboard-panel flex min-h-[18rem] w-full max-w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[#30363D] p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-[#3fb950]" strokeWidth={1.75} aria-hidden />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Emendas parlamentares
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              Motor Forense TransparênciaBR — totais por modalidade (RP6, RP7, RP99).
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
            Total filtrado
          </p>
          <p className="font-mono text-lg font-semibold tabular-nums tracking-tight text-[#3fb950]">
            {fmtBrl(total)}
          </p>
        </div>
      </div>

      <div className="border-b border-[#21262D] bg-[#0D1117]/40 px-4 py-3 backdrop-blur-md">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8B949E]">
            LOA / histórico orçamentário (2015–2026)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="loa-ano">
              Exercício LOA
            </label>
            <select
              id="loa-ano"
              value={anoLoa}
              onChange={(e) => setAnoLoa(Number(e.target.value))}
              className="rounded-lg border border-[#30363D] bg-[#161B22] px-2 py-1.5 font-mono text-xs text-[#C9D1D9]"
            >
              {exerciciosLoa.map((e) => (
                <option key={e.ano} value={e.ano}>
                  {e.label}
                </option>
              ))}
            </select>
            {loaSel?.loa ? (
              <a
                href={loaSel.loa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[#30363D] px-2 py-1.5 text-[11px] font-medium text-[#58A6FF] hover:border-[#58A6FF]/50"
              >
                Microdados LOA <ExternalLink className="size-3.5 opacity-80" aria-hidden />
              </a>
            ) : null}
            {loaSel?.emendas ? (
              <a
                href={loaSel.emendas}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-[#30363D] px-2 py-1.5 text-[11px] font-medium text-[#a371f7] hover:border-[#a371f7]/40"
              >
                API emendas (ano) <ExternalLink className="size-3.5 opacity-80" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {PILLS.map((p) => {
            const active = filtro === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setFiltro(p.id)}
                className={[
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-tight transition",
                  active
                    ? "border-[#58A6FF]/50 bg-[#58A6FF]/15 text-[#F0F4FC] shadow-[0_0_24px_rgba(88,166,255,0.12)]"
                    : "border-[#30363D] bg-[#161B22]/70 text-[#8B949E] hover:border-[#484F58] hover:text-[#C9D1D9]",
                ].join(" ")}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <ul className="max-h-[22rem] flex-1 divide-y divide-[#21262D] overflow-y-auto px-4 py-2">
        {filtradas.length === 0 ? (
          <li className="py-10 text-center text-sm text-[#8B949E]">
            Nenhuma emenda neste filtro.
          </li>
        ) : (
          filtradas.map((row, idx) => (
            <li key={row.id ?? row.codigo_emenda ?? idx} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="inline-flex rounded-md border border-[#30363D] bg-[#21262D] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#a371f7]">
                    {labelRpForTipo(row.tipo_emenda)}
                  </span>
                  <p className="mt-2 text-sm font-medium leading-snug text-[#F0F4FC]">
                    {row.descricao_normalizada}
                  </p>
                  {row.ano != null ? (
                    <p className="mt-1 font-mono text-[10px] text-[#484F58]">
                      Exercício {row.ano}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-[#C9D1D9]">
                  {fmtBrl(row.valor_normalizado)}
                </span>
              </div>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
