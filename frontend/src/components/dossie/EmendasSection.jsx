import { Coins, ExternalLink, Globe } from "lucide-react";
import { useMemo, useState } from "react";

import EmBreve from "./EmBreve.jsx";
import {
  FILTROS_EMENDA,
  labelRpForTipo,
  normalizeEmendasList,
  rowMatchesFiltro,
} from "../../utils/emendasNormalize.js";
import { listarExerciciosLoa } from "../../utils/loaPortalUrls.js";

function fmtBrl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return x.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

/** URL explícita no documento ou fallback Portal da Transparência (detalhe emenda / API ano). */
function portalUrlForRow(row) {
  const direct = String(row.url_portal_transparencia || "").trim();
  if (direct) return direct;
  const cod = row.codigo_emenda;
  if (cod) {
    return `https://portaldatransparencia.gov.br/emendas/detalhe?codigoEmenda=${encodeURIComponent(String(cod))}`;
  }
  if (row.ano != null) {
    return `https://api.portaldatransparencia.gov.br/api-de-dados/emendas-parlamentares?ano=${encodeURIComponent(String(row.ano))}`;
  }
  return "";
}

const PILLS = [
  { id: FILTROS_EMENDA.TODAS, label: "Todas" },
  { id: FILTROS_EMENDA.PIX, label: "PIX (RP99)" },
  { id: FILTROS_EMENDA.INDIVIDUAL, label: "Individuais (RP6)" },
  { id: FILTROS_EMENDA.BANCADA, label: "Bancada (RP7)" },
];

/**
 * Emendas parlamentares com ligação ao Portal da Transparência quando disponível.
 * @param {{ politico?: Record<string, unknown> | null; showPageHeading?: boolean }} props
 */
export default function EmendasSection({ politico = null, showPageHeading = false }) {
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
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return normalizeEmendasList(raw);
  }, [politico]);

  const semDadoReal = rows.length === 0;

  const filtradas = useMemo(
    () => rows.filter((r) => rowMatchesFiltro(filtro, r)),
    [rows, filtro],
  );

  const total = useMemo(
    () =>
      filtradas.reduce(
        (acc, r) => acc + (Number(r.valor_pago_normalizado ?? r.valor_normalizado) || 0),
        0,
      ),
    [filtradas],
  );

  const inner = (
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
            <label className="sr-only" htmlFor="loa-ano-emendas">
              Exercício LOA
            </label>
            <select
              id="loa-ano-emendas"
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

      {semDadoReal ? (
        <EmBreve
          titulo="Emendas — em breve"
          subtitulo="Aurora ainda não cruzou as emendas RP6/RP7/RP99 deste parlamentar com os portais SIOP e Transfere Gov. Compre o dossiê premium para disparar a coleta sob demanda."
        />
      ) : (
        <ul className="max-h-[22rem] flex-1 divide-y divide-[#21262D] overflow-y-auto px-4 py-2">
          {filtradas.length === 0 ? (
            <li className="py-10 text-center text-sm text-[#8B949E]">
              Nenhuma emenda neste filtro.
            </li>
          ) : (
            filtradas.map((row, idx) => {
              const portal = portalUrlForRow(row);
              const valorExib =
                row.valor_pago_normalizado != null && row.valor_pago_normalizado > 0
                  ? row.valor_pago_normalizado
                  : row.valor_normalizado;
              const destino = [row.municipio_favorecido, row.uf_favorecido].filter(Boolean).join(" / ");
              const nomeFav = String(
                row.favorecido ??
                  row.nome_favorecido ??
                  row.entidade ??
                  row.descricao_normalizada ??
                  "",
              ).trim();
              const locLine =
                row.municipio || row.estado
                  ? [row.municipio, row.estado].filter(Boolean).join(" — ")
                  : "";
              const funcLine =
                row.funcao || row.subfuncao
                  ? [row.funcao, row.subfuncao].filter(Boolean).join(" / ")
                  : "";
              return (
                <li key={row.id ?? row.codigo_emenda ?? idx} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex rounded-md border border-[#30363D] bg-[#21262D] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#a371f7]">
                          {labelRpForTipo(row.tipo_emenda)}
                        </span>
                        {locLine ? (
                          <span className="text-[10px] text-[#8B949E]">{locLine}</span>
                        ) : null}
                        {funcLine ? (
                          <span className="text-[10px] text-[#58A6FF]">{funcLine}</span>
                        ) : null}
                      </div>
                      {row.suspeita ? (
                        <span className="mt-1 inline-flex items-center gap-1 rounded border border-[#f85149]/50 bg-[#f85149]/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-[#f85149]">
                          Valor suspeito
                        </span>
                      ) : null}
                      {portal ? (
                        <a
                          href={portal}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 block text-sm font-medium leading-snug text-[#58A6FF] underline decoration-[#58A6FF]/40 underline-offset-2 hover:text-[#93c5fd]"
                        >
                          {nomeFav || row.descricao_normalizada}
                          <ExternalLink
                            className="ms-1 inline size-3.5 align-text-bottom opacity-80"
                            aria-hidden
                          />
                        </a>
                      ) : (
                        <p className="mt-2 text-sm font-medium leading-snug text-[#F0F4FC]">
                          {nomeFav || row.descricao_normalizada}
                        </p>
                      )}
                      {row.ano != null ? (
                        <p className="mt-1 font-mono text-[10px] text-[#484F58]">
                          Exercício {row.ano}
                          {destino ? ` · Destino: ${destino}` : ""}
                        </p>
                      ) : destino ? (
                        <p className="mt-1 font-mono text-[10px] text-[#484F58]">Destino: {destino}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {portal ? (
                        <a
                          href={portal}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-sm font-semibold tabular-nums text-[#3fb950] underline decoration-[#3fb950]/50 underline-offset-2 hover:text-[#86efac]"
                        >
                          {fmtBrl(valorExib)}
                        </a>
                      ) : (
                        <span className="font-mono text-sm font-semibold tabular-nums text-[#C9D1D9]">
                          {fmtBrl(valorExib)}
                        </span>
                      )}
                      {portal ? (
                        <a
                          href={portal}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-[#58A6FF] hover:underline"
                        >
                          Portal Transparência
                          <ExternalLink className="size-3" strokeWidth={2} aria-hidden />
                        </a>
                      ) : null}
                      {row.valor_pago != null && Number(row.valor_pago) > 0 ? (
                        <span className="text-[10px] text-[#8B949E]">Pago: {fmtBrl(row.valor_pago)}</span>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </section>
  );

  if (showPageHeading) {
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Globe className="size-4 text-[#4ADE80]" strokeWidth={1.75} />
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
              Emendas parlamentares
            </h2>
            <p className="mt-1 text-lg leading-relaxed text-[#8B949E]">
              RP6 / RP7 / RP99 e exercícios LOA (portal SIOP).
            </p>
          </div>
        </div>
        {inner}
      </>
    );
  }

  return inner;
}
