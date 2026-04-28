import { ChevronDown, ExternalLink, FileWarning, Lock } from "lucide-react";
import { useMemo, useState } from "react";

const PREVIEW_COUNT = 4;
const VALOR_CRITICO_BRL = 5000;

/** Palavras-chave para alerta semântico (fornecedor / tipo da despesa). */
const SEMANTIC_KEYWORDS = [
  "CONSULTORIA",
  "LOCACAO",
  "LOCAÇÃO",
  "UNIDAS",
  "DIVULGACAO",
  "DIVULGAÇÃO",
];

function normalizeAsciiUpper(s) {
  return String(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase();
}

function pickFornecedorStatic(row) {
  return String(
    row.txtFornecedor ?? row.nomeFornecedor ?? row.nome_fornecedor ?? "",
  ).trim();
}

function pickTipoDespesa(row) {
  return String(row.tipoDespesa ?? row.tipo_despesa ?? row.descricao ?? "").trim();
}

/** Voos comuns: não aplicar alerta semântico automático (rubrica ambígua). */
function isLikelyFlightOrPassagemRow(row) {
  const blob = normalizeAsciiUpper(
    `${pickFornecedorStatic(row)} ${pickTipoDespesa(row)}`,
  );
  return (
    /\b(PASSAGEM|AEREO|AÉREO|VOO|BILHETE|EMISSAO|EMISSÃO|LATAM|GOL|AZUL|TAM)\b/u.test(
      blob,
    ) || /PASSAGENS?\s+E\s+LUBRIFICANTES/i.test(blob)
  );
}

/**
 * Heurística visual por nota (front-end). Prioridade: valor crítico > semântico.
 * @returns {{ kind: "valor_critico" | "alerta_semantico"; label: string } | null}
 */
export function heuristicaAlertaNotaCeap(row) {
  const valor = pickValorStatic(row);
  if (valor != null && valor > VALOR_CRITICO_BRL) {
    return { kind: "valor_critico", label: "Valor Crítico" };
  }

  const fornecedor = normalizeAsciiUpper(pickFornecedorStatic(row));
  const tipo = normalizeAsciiUpper(pickTipoDespesa(row));
  const haystack = `${fornecedor} ${tipo}`;

  const hitKeyword = SEMANTIC_KEYWORDS.some((k) => {
    const kn = normalizeAsciiUpper(k);
    return haystack.includes(kn);
  });

  if (!hitKeyword) return null;

  if (isLikelyFlightOrPassagemRow(row)) {
    return null;
  }

  return { kind: "alerta_semantico", label: "Alerta Semântico" };
}

function pickValorStatic(row) {
  const v =
    row.valorLiquido ??
    row.vlrLiquido ??
    row.valor_liquido ??
    row.valor;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

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
  return pickFornecedorStatic(row);
}

function pickCnpj(row) {
  const raw = row.cnpjCpf ?? row.cnpjCpfFornecedor;
  if (raw == null || raw === "") return "";
  return String(raw).replace(/\D/g, "");
}

function pickValor(row) {
  return pickValorStatic(row);
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

function ForensicBadge({ info }) {
  if (!info) return null;
  if (info.kind === "valor_critico") {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-1 rounded border border-[#f85149]/50 bg-[#f85149]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#f85149]"
        title="Valor acima do limiar operacional de auditoria"
      >
        🚨 {info.label}
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded border border-yellow-700/50 bg-yellow-900/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-500"
      title="Palavra-chave ou rubrica com revisão recomendada"
    >
      ⚠️ {info.label}
    </span>
  );
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

  const prisma = record?.investigacao_prisma_ceap;

  const catalogo = useMemo(() => {
    const raw = prisma?.despesas_ceap_catalogo;
    return Array.isArray(raw) ? raw : [];
  }, [prisma]);

  const totalNotasAnalisadas = useMemo(() => {
    const n = prisma?.total_notas_analisadas;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
  }, [prisma]);

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
  const hiddenCount =
    totalNotasAnalisadas != null
      ? Math.max(0, totalNotasAnalisadas - PREVIEW_COUNT)
      : Math.max(0, sorted.length - PREVIEW_COUNT);
  const canSeeAll = godMode || oracleUnlocked;

  if (catalogo.length === 0) {
    const hasBundleSemCatalogo =
      prisma != null &&
      typeof prisma === "object" &&
      prisma.despesas_ceap_catalogo == null &&
      (totalNotasAnalisadas != null || prisma.benford_agente != null);

    return (
      <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/90 p-6 sm:p-8">
        <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
          Monitor CEAP — auditoria de notas
        </h2>
        <p className="mt-3 text-lg leading-relaxed text-[#8B949E]">
          {hasBundleSemCatalogo ? (
            <>
              O relatório tem metadados CEAP (motor), mas o array{" "}
              <span className="font-mono text-[#58A6FF]">despesas_ceap_catalogo</span> está ausente.
              Rode novamente{" "}
              <span className="font-mono text-[#58A6FF]">node ceap_motor.js</span> ou limpe o cache
              do navegador e atualize a página.
            </>
          ) : (
            <>
              Sem catálogo CEAP neste registo. Rode o motor{" "}
              <span className="font-mono text-[#58A6FF]">node ceap_motor.js</span> para sincronizar o
              documento <span className="font-mono text-[#58A6FF]">transparency_reports</span>.
            </>
          )}
        </p>
      </div>
    );
  }

  const rowsToShow = canSeeAll && expanded ? sorted : preview;
  /** Lista completa desbloqueada: contenção de altura (até ~300 notas). */
  const showScrollArea = canSeeAll && expanded;

  const listBody = (
    <ul className="space-y-3">
      {rowsToShow.map((row, idx) => {
        const gen = row.descricao_generica === true;
        const url = pickUrlDocumento(row);
        const fornecedor = pickFornecedor(row);
        const dataEmissao = pickDataEmissao(row);
        const cnpj = pickCnpj(row);
        const tipo =
          String(row.tipoDespesa ?? row.tipo_despesa ?? row.descricao ?? "").trim() || "—";
        const forensic = heuristicaAlertaNotaCeap(row);
        return (
          <li
            key={`${pickUrlDocumento(row) || fornecedor}-${cnpj}-${dataEmissao}-${idx}`}
            className={[
              "rounded-lg border px-3 py-3 sm:px-4",
              gen
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-[#21262D] bg-[#080B14]/80",
            ].join(" ")}
          >
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="flex flex-wrap items-center gap-2">
                  {gen ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      <FileWarning className="size-3.5" strokeWidth={2} aria-hidden />
                      Descrição genérica
                    </span>
                  ) : null}
                  <ForensicBadge info={forensic} />
                  <span className="font-data shrink-0 text-sm text-[#8B949E]">
                    Emissão: {dataEmissao || "—"}
                  </span>
                </div>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                  <p
                    className="min-w-0 flex-1 truncate text-lg font-semibold leading-snug text-[#F0F4FC] md:text-xl"
                    title={fornecedor || undefined}
                  >
                    {fornecedor || "Fornecedor não informado"}
                  </p>
                </div>
                {cnpj ? (
                  <p className="mt-1 truncate font-data text-sm text-[#484F58]" title={cnpj}>
                    CNPJ/CPF: {cnpj}
                  </p>
                ) : null}
                {tipo !== "—" ? (
                  <p className="mt-1 line-clamp-2 text-base leading-relaxed text-[#8B949E]">
                    {tipo}
                  </p>
                ) : null}
              </div>
              <div className="flex w-full shrink-0 flex-col items-end gap-1 sm:ms-auto sm:w-auto sm:min-w-[11rem] sm:max-w-[min(100%,14rem)] sm:text-right">
                <p className="font-data text-xl font-bold tabular-nums text-[#7DD3FC] md:text-2xl">
                  {fmtBrl(pickValor(row))}
                </p>
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-end gap-1 text-base font-semibold leading-snug text-[#58A6FF] hover:underline"
                  >
                    Ver Nota Fiscal Oficial
                    <ExternalLink className="size-3.5 shrink-0" strokeWidth={2} aria-hidden />
                  </a>
                ) : (
                  <p className="text-sm text-[#484F58]">URL da nota indisponível</p>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/95 p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#F0F4FC] md:text-3xl">
            Monitor CEAP — amostra prioritária
          </h2>
          <p className="mt-2 text-lg leading-relaxed text-[#8B949E]">
            Dados da API da Câmara (Top 300 persistido). Quatro despesas prioritárias; nota oficial
            quando disponível.
            {totalNotasAnalisadas != null ? (
              <>
                {" "}
                Varredura forense (Benford) sobre{" "}
                <span className="font-semibold text-[#C9D1D9]">
                  {totalNotasAnalisadas.toLocaleString("pt-BR")}
                </span>{" "}
                notas.
              </>
            ) : null}
          </p>
        </div>
      </div>

      {showScrollArea ? (
        <div className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">{listBody}</div>
      ) : (
        listBody
      )}

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
              Catálogo completo da CEAP sincronizado no relatório. Desbloqueie com sessão iniciada ou créditos do laboratório.
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
