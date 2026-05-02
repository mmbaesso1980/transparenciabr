import { FileText, ShieldCheck } from "lucide-react";

import { LEGACY_ANALISE_FIELD } from "../../constants/legacyFieldNames.js";

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default function PremiumDossierSection({ record = null }) {
  const text =
    record?.conteudo_premium ??
    record?.llm_summary ??
    record?.relatorio_premium ??
    record?.analise_semantica?.resumo_auditoria ??
    record?.analise_aurora?.resumoAuditoria ??
    record?.[LEGACY_ANALISE_FIELD]?.resumoAuditoria ??
    "";
  const contexto = record?.perfil_contextual;
  const paragraphs = splitParagraphs(text);

  return (
    <section className="glass-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-[#7DD3FC]" strokeWidth={1.75} />
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Relatorio premium factual
            </h3>
            <p className="text-[11px] text-[#8B949E]">
              Texto consolidado para GOD_MODE / camada premium.
            </p>
          </div>
        </div>
        <ShieldCheck className="size-4 text-[#4ADE80]" strokeWidth={1.75} />
      </div>

      <div className="space-y-4 px-4 py-4">
        {contexto ? (
          <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/70 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8B949E]">
              Contexto calibrado
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[#C9D1D9]">
              {String(contexto)}
            </p>
          </div>
        ) : null}

        {paragraphs.length === 0 ? (
          <p className="rounded-xl border border-[#30363D] bg-[#0D1117]/70 px-4 py-6 text-center text-xs text-[#8B949E]">
            Relatorio premium ainda nao sincronizado para este dossie.
          </p>
        ) : (
          <article className="space-y-3 rounded-xl border border-[#30363D] bg-[#010409]/50 p-4">
            {paragraphs.map((paragraph, idx) => (
              <p key={idx} className="text-sm leading-relaxed text-[#DDE7F5]">
                {paragraph}
              </p>
            ))}
          </article>
        )}
      </div>
    </section>
  );
}
