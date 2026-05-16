import { ChevronDown, Lock } from "lucide-react";
import { useMemo, useState } from "react";

import CeapNotesViewer from "./CeapNotesViewer.jsx";

export { heuristicaAlertaNotaCeap } from "./CeapNotesViewer.jsx";

const PREVIEW_COUNT = 4;

function pickDataEmissao(row) {
  const raw =
    row.dataEmissao ??
    row.data_emissao ??
    row.data_documento ??
    row.dataDocumento ??
    "";
  return String(raw ?? "").slice(0, 10);
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

/**
 * Auditoria CEAP: amostra prioritária + paywall GOD/créditos.
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
              O relatório tem metadados CEAP, mas o catálogo de notas ainda não foi materializado neste
              documento. Aguarde o processamento forense do Dossiê Aurora ou dispare uma nova coleta sob
              demanda.
            </>
          ) : (
            <>
              Sem catálogo CEAP neste registo. Aguarde o processamento forense do Dossiê Aurora ou utilize
              &quot;Atualizar agora&quot; quando disponível para o seu perfil.
            </>
          )}
        </p>
      </div>
    );
  }

  const rowsToShow = canSeeAll && expanded ? sorted : preview;
  const showScrollArea = canSeeAll && expanded;

  const listBody = <CeapNotesViewer rows={rowsToShow} />;

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
