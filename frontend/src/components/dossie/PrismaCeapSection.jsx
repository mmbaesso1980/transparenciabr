import { GitBranch } from "lucide-react";
import { useMemo } from "react";

/**
 * Painel dos 12 Prismas Investigativos quando o pipeline gravar `investigacao_prisma_ceap`
 * em `transparency_reports` (engine 27).
 */
export default function PrismaCeapSection({ record }) {
  const bundle = record?.investigacao_prisma_ceap;
  const prismas = bundle?.prismas;

  const rows = useMemo(() => {
    if (!prismas || typeof prismas !== "object") return [];
    return Object.entries(prismas).map(([nome, payload]) => {
      const p = payload && typeof payload === "object" ? payload : {};
      return {
        nome,
        status: p.status ?? "—",
        nota: typeof p.nota === "string" ? p.nota : "",
      };
    });
  }, [prismas]);

  if (!bundle) {
    return (
      <div className="rounded-lg border border-[#30363D] bg-[#0D1117]/90 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
          Prismas CEAP (piloto)
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#C9D1D9]">
          Os indicadores dos 12 prismas aparecem aqui após executar o motor de ingestão CEAP e o
          merge em Firestore (<span className="font-mono text-[#58A6FF]">investigacao_prisma_ceap</span>
          ).
        </p>
      </div>
    );
  }

  const avisos = Array.isArray(bundle.avisos) ? bundle.avisos : [];

  return (
    <div className="grid gap-4 text-left md:grid-cols-2">
      <div className="rounded-lg border border-[#30363D] bg-[#0D1117]/90 p-4">
        <div className="flex items-center gap-2 border-b border-[#21262D] pb-3">
          <GitBranch className="size-4 text-[#58A6FF]" strokeWidth={1.75} aria-hidden />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
              Investigacao Prisma CEAP
            </p>
            <p className="text-xs text-[#484F58]">
              Fonte: {bundle.fonte ?? "—"} · Documentos API:{" "}
              <span className="font-mono text-[#C9D1D9]">{bundle.n_documentos_api ?? "—"}</span>
            </p>
          </div>
        </div>
        <ul className="mt-3 max-h-[220px] space-y-2 overflow-y-auto text-xs leading-relaxed text-[#C9D1D9]">
          {avisos.map((a) => (
            <li key={a} className="rounded border border-[#30363D]/80 bg-[#080B14]/80 p-2 text-[#8B949E]">
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-[#30363D] bg-[#0D1117]/90 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8B949E]">
          Estado por prisma
        </p>
        <ul className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">
          {rows.map((r) => (
            <li
              key={r.nome}
              className="rounded border border-[#21262D] bg-[#080B14]/72 px-2 py-1.5 text-[11px]"
            >
              <span className="font-mono text-[#7DD3FC]">{r.nome}</span>
              <span className="text-[#484F58]"> · </span>
              <span className="text-[#C9D1D9]">{r.status}</span>
              {r.nota ? <p className="mt-0.5 text-[10px] leading-snug text-[#8B949E]">{r.nota}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
