import { Sparkles } from "lucide-react";

/**
 * EmBreve — placeholder honesto exibido quando o pipeline Aurora ainda
 * não processou esta seção do dossiê. NUNCA exibir mock no lugar.
 *
 * Filosofia: "Toda nota é suspeita até prova contrária. Não fazemos
 * denúncia — apresentamos fatos." Se não temos o fato, dizemos.
 *
 * Usado em: EmendasParlamentaresSection, AgendaDoDia, e qualquer outra
 * seção sem dado real para o parlamentar consultado.
 *
 * @param {{
 *   titulo?: string,
 *   subtitulo?: string,
 *   ctaLabel?: string,
 *   onCta?: () => void,
 *   variant?: 'panel' | 'inline',
 * }} props
 */
export default function EmBreve({
  titulo = "Em breve",
  subtitulo = "Aurora ainda não processou esta camada para este parlamentar. Compre o dossiê premium para disparar a análise sob demanda.",
  ctaLabel = "Disparar análise (200 créditos)",
  onCta,
  variant = "panel",
}) {
  if (variant === "inline") {
    return (
      <div className="rounded-xl border border-[#30363D]/80 bg-[#0D1117]/60 px-4 py-6 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#fde68a]">
          {titulo}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">{subtitulo}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#fde68a]/40 bg-[#fde68a]/8">
        <Sparkles className="size-5 text-[#fde68a]" strokeWidth={1.75} />
      </span>
      <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#fde68a]">
        {titulo}
      </p>
      <p className="max-w-md text-sm leading-relaxed text-[#8B949E]">{subtitulo}</p>
      {onCta ? (
        <button
          type="button"
          onClick={onCta}
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-[#d4af37]/55 bg-[#d4af37]/12 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#fde68a] transition hover:bg-[#d4af37]/20"
        >
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
