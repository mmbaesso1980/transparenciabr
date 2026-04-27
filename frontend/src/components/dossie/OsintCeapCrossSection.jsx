import { Newspaper, Receipt, Scale } from "lucide-react";

import { scalarToDisplay } from "../../utils/dataParsers.js";

/**
 * Card Radar OSINT (Agente 12): cruzamento despesa CEAP declarada × rastro público na mídia oficial.
 *
 * Espera payloads flexíveis do Vertex / Firestore, por ex.:
 * `{ nota_ref, objeto_nf, contextualizacao_midia, fontes_midia[], severidade }`
 */
export default function OsintCeapCrossSection({ items = [] }) {
  const rows = Array.isArray(items) ? items : [];

  return (
    <section className="glass-card overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[#30363D] px-4 py-3">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-[#f97316]" strokeWidth={1.75} />
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[#F0F4FC]">
              Radar OSINT × CEAP — contextualização de mídia
            </h2>
            <p className="text-[11px] text-[#8B949E]">
              Agente 12 cruza o objeto da nota com agenda e cobertura pública para desvio de finalidade.
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-[#30363D] bg-[#0D1117]/60 px-4 py-6 text-center text-xs leading-relaxed text-[#8B949E]">
            Aguardando achados do Radar OSINT para este mandato. Quando o motor publicar cruzamentos
            CEAP × mídia, aparecerão aqui com fonte e contextualização para auditoria forense.
          </div>
        ) : (
          rows.map((item, idx) => {
            const ref = scalarToDisplay(
              item.nota_ref ?? item.ref ?? item.numero_documento,
              `Nota ${idx + 1}`,
            );
            const objeto = scalarToDisplay(
              item.objeto_nf ?? item.objeto_despesa ?? item.titulo ?? item.descricao,
              "",
            );
            const contexto = scalarToDisplay(
              item.contextualizacao_midia ??
                item.contexto_midia ??
                item.prova_cruzada ??
                item.analise,
              "",
            );
            const fontes = Array.isArray(item.fontes_midia)
              ? item.fontes_midia
              : Array.isArray(item.links)
                ? item.links
                : [];
            return (
              <article
                key={`${ref}-${idx}`}
                className="rounded-xl border border-[#f97316]/25 bg-[#0D1117]/80 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <Receipt className="size-4 shrink-0 text-[#facc15]" aria-hidden />
                    <span className="font-data text-[11px] text-[#7DD3FC]">{ref}</span>
                  </div>
                  {item.severidade ? (
                    <span className="rounded border border-[#21262D] bg-[#010409]/60 px-2 py-0.5 font-data text-[10px] uppercase tracking-wide text-[#fde68a]">
                      {scalarToDisplay(item.severidade, "")}
                    </span>
                  ) : null}
                </div>
                {objeto ? (
                  <p className="mt-3 text-sm font-medium leading-snug text-[#F0F4FC]">{objeto}</p>
                ) : null}
                {contexto ? (
                  <div className="mt-3 rounded-lg border border-[#21262D] bg-[#010409]/50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
                      Contextualização de mídia
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-[#C9D1D9]">{contexto}</p>
                  </div>
                ) : null}
                {fontes.length > 0 ? (
                  <div className="mt-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8B949E]">
                      <Newspaper className="size-3.5" aria-hidden />
                      Fontes
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {fontes.slice(0, 6).map((f, i) => {
                        const url =
                          typeof f === "string"
                            ? f
                            : typeof f?.url === "string"
                              ? f.url
                              : "";
                        const label = scalarToDisplay(
                          typeof f === "object" && f ? f.titulo ?? f.label : "",
                          url || `Fonte ${i + 1}`,
                        );
                        return url ? (
                          <li key={`${url}-${i}`}>
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#58A6FF] underline-offset-2 hover:underline"
                            >
                              {label}
                            </a>
                          </li>
                        ) : (
                          <li key={i} className="text-xs text-[#C9D1D9]">
                            {label}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
