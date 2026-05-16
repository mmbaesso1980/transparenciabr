import { ExternalLink, FileWarning } from "lucide-react";

const VALOR_CRITICO_BRL = 5000;

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

function pickValorStatic(row) {
  const v =
    row.valorLiquido ??
    row.vlrLiquido ??
    row.valor_liquido ??
    row.valor;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

const linkDocClass =
  "font-data text-xl font-bold tabular-nums text-[#7DD3FC] underline decoration-[#58A6FF]/50 underline-offset-2 transition hover:text-[#93c5fd] md:text-2xl";

const linkNomeClass =
  "min-w-0 flex-1 truncate text-lg font-semibold leading-snug text-[#58A6FF] underline decoration-[#58A6FF]/40 underline-offset-2 hover:text-[#93c5fd] md:text-xl";

/**
 * Lista de notas CEAP — valor e/ou fornecedor ligam à fonte primária quando `urlDocumento` existe.
 * @param {{ rows: Record<string, unknown>[] }} props
 */
export default function CeapNotesViewer({ rows = [] }) {
  return (
    <ul className="space-y-3">
      {rows.map((row, idx) => {
        const gen = row.descricao_generica === true;
        const url = pickUrlDocumento(row);
        const fornecedor = pickFornecedor(row);
        const dataEmissao = pickDataEmissao(row);
        const cnpj = pickCnpj(row);
        const tipo =
          String(row.tipoDespesa ?? row.tipo_despesa ?? row.descricao ?? "").trim() || "—";
        const forensic = heuristicaAlertaNotaCeap(row);
        const valorFmt = fmtBrl(pickValor(row));
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
                  {url ? (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkNomeClass}
                      title={fornecedor || "Abrir documento oficial"}
                    >
                      {fornecedor || "Fornecedor não informado"}
                    </a>
                  ) : (
                    <p
                      className="min-w-0 flex-1 truncate text-lg font-semibold leading-snug text-[#F0F4FC] md:text-xl"
                      title={fornecedor || undefined}
                    >
                      {fornecedor || "Fornecedor não informado"}
                    </p>
                  )}
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
                {url ? (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={linkDocClass}
                    title="Abrir documento oficial"
                  >
                    {valorFmt}
                  </a>
                ) : (
                  <p className="font-data text-xl font-bold tabular-nums text-[#7DD3FC] md:text-2xl">
                    {valorFmt}
                  </p>
                )}
                {url ? (
                  <span className="inline-flex items-center justify-end gap-1 text-[11px] font-medium text-[#8B949E]">
                    Fonte primária
                    <ExternalLink className="size-3 shrink-0 opacity-80" strokeWidth={2} aria-hidden />
                  </span>
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
}
