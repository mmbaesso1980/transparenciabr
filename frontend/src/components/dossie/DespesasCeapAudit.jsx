import { ChevronDown, ExternalLink, FileWarning, Lock } from "lucide-react";
import { useMemo, useState } from "react";

const PREVIEW_COUNT = 4;

function fmtBrl(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function pickFornecedor(row) {
  return String(
    row.txtFornecedor ?? row.nomeFornecedor ?? row.nome_fornecedor ?? "",
  ).trim();
}

function pickValor(row) {
  const v =
    row.valorLiquido ??
    row.vlrLiquido ??
    row.valor_liquido ??
    row.valor;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pickDataEmissao(row) {
  const raw =
    row.dataEmissao ??
    row.data_emissao ??
    row.data_documento ??
    row.dataDocumento ??
    "";
  return String(raw ?? "").slice(0, 10);
}

function pickUrlDocumento(row) {
  const u =
    row.urlDocumento ??
      row.url_documento_oficial ??
      row.url_documento ??
      row.url ??
      "";
  return typeof u === "string" ? u.trim() : "";
}

/**
 * Auditoria CEAP: 4 despesas em destaque (mais recentes; empate por valor) + paywall GOD/créditos.
 *
 * @param {{
 *   record: Record<string, unknown> | null;
 *   godMode: boolean;
 *   oracleUnlocked: boolean;
 *   onRequestUnlock?: () => void;
 * }} props
 */
export default function DespesasCeapAudit({
  record,
  godMode,
  oracleUnlocked,
  onRequestUnlock,
}) {
  const [expanded, setExpanded] = useState(false);

  const catalogo = useMemo(() => {
    const raw = record?.investigacao_prisma_ceap?.despesas_ceap_catalogo;
    return Array.isArray(raw) ? raw : [];
  }, [record]);

  const sorted = useMemo(() => {
    return [...catalogo].sort((a, b) => {
      const db = pickDataEmissao(b);
      const da = pickDataEmissao(a);
      if (db !== da) return db.localeCompare(da);
      const vb = pickValor(b) ?? -Infinity;
      const va = pickValor(a) ?? -Infinity;
      return vb - va;
    });
  }, [catalogo]);

  const preview = sorted.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, sorted.length - PREVIEW_COUNT);
  const canSeeAll = godMode || oracleUnlocked;

  if (catalogo.length === 0) {
    return (
      <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/90 p-6 sm:p-8">
        <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
          Monitor CEAP — auditoria de notas
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-[#8B949E]">
          Sem catálogo CEAP neste registo. Rode o motor{" "}
          <span className="font-mono text-[#58A6FF]">node ceap_motor.js</span> para sincronizar o
          documento <span className="font-mono text-[#58A6FF]">transparency_reports</span>.
        </p>
      </div>
    );
  }

  const rowsToShow = canSeeAll && expanded ? sorted : preview;

  return (
    <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/95 p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
            Monitor CEAP — amostra prioritária
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-[#8B949E]">
            Dados da API da Câmara (catálogo sincronizado). Quatro despesas mais recentes; nota fiscal
            oficial em PDF quando disponível.
          </p>
        </div>
      </div>

      <ul className="space-y-3">
        {rowsToShow.map((row, idx) => {
          const gen = row.descricao_generica === true;
          const url = pickUrlDocumento(row);
          const fornecedor = pickFornecedor(row);
          const dataEmissao = pickDataEmissao(row);
          const tipo =
            String(row.tipoDespesa ?? row.tipo_despesa ?? row.descricao ?? "").trim() || "—";
          return (
            <li
              key={`${pickUrlDocumento(row) || fornecedor}-${dataEmissao}-${idx}`}
              className={[
                "rounded-lg border px-3 py-3 sm:px-4",
                gen
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-[#21262D] bg-[#080B14]/80",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {gen ? (
                      <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                        <FileWarning className="size-3.5" strokeWidth={2} aria-hidden />
                        Descrição genérica
                      </span>
                    ) : null}
                    <span className="font-data text-sm text-[#8B949E]">
                      Emissão: {dataEmissao || "—"}
                    </span>
                  </div>
                  <p className="mt-1 text-lg font-semibold leading-snug text-[#F0F4FC] md:text-xl">
                    {fornecedor || "Fornecedor não informado"}
                  </p>
                  <p className="mt-1 text-base leading-relaxed text-[#8B949E]">{tipo}</p>
                </div>
                <div className="text-right">
                  <p className="font-data text-xl font-bold tabular-nums text-[#7DD3FC] md:text-2xl">
                    {fmtBrl(pickValor(row))}
                  </p>
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-base font-semibold text-[#58A6FF] hover:underline"
                    >
                      Ver Nota Fiscal Oficial
                      <ExternalLink className="size-3.5" strokeWidth={2} aria-hidden />
                    </a>
                  ) : (
                    <p className="mt-2 text-sm text-[#484F58]">URL da nota indisponível</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 border-t border-[#21262D] pt-4">
        {!canSeeAll && hiddenCount > 0 ? (
          <div className="rounded-lg border border-[#f85149]/35 bg-[#0d1117] p-6 text-center">
            <Lock
              className="mx-auto size-10 text-[#f85149]"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className="mt-4 text-lg font-bold tracking-tight text-[#F0F4FC] md:text-xl">
              ACESSO RESTRITO: {hiddenCount} notas ocultas
            </p>
            <p className="mt-2 text-lg leading-relaxed text-[#8B949E]">
              Catálogo completo da CEAP sincronizado no relatório. Desbloqueie com Modo GOD ou créditos
              do laboratório.
            </p>
            {onRequestUnlock ? (
              <button
                type="button"
                onClick={() => onRequestUnlock()}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-full border border-[#FDE047]/50 bg-[#FDE047]/10 px-8 py-3.5 text-base font-semibold text-[#FDE047] transition hover:bg-[#FDE047]/20"
              >
                Desbloquear Dossiê Completo
              </button>
            ) : null}
          </div>
        ) : canSeeAll ? (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[#30363D] bg-[#161B22] px-5 py-3.5 text-base font-semibold text-[#F0F4FC] transition hover:border-[#58A6FF]/45 hover:bg-[#21262D]"
          >
            {expanded
              ? `Mostrar só as ${PREVIEW_COUNT} prioritárias`
              : `Ver todas as ${sorted.length} notas`}
            <ChevronDown
              className={["size-4 transition", expanded ? "rotate-180" : ""].join(" ")}
              strokeWidth={2}
              aria-hidden
            />
          </button>
        ) : null}
      </div>
    </div>
  );
}
