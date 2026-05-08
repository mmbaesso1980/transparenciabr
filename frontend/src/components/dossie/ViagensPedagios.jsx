/**
 * ViagensPedagios — Categoria canônica nº 4 do dossiê.
 *
 * Cruza passagens aéreas, diárias e pedágios reembolsados com agenda oficial.
 * Detecta viagens fantasmas (reembolso sem evento correspondente).
 */

import EmBreve from "./EmBreve.jsx";

export default function ViagensPedagios({ politicoNome }) {
  const subtitulo = politicoNome
    ? `Aurora ainda não cruzou as viagens, passagens e pedágios de ${politicoNome} com a agenda oficial da Câmara. Compre o dossiê premium para disparar a coleta sob demanda.`
    : "Aurora ainda não cruzou viagens, passagens e pedágios com a agenda oficial. Compre o dossiê premium para disparar a coleta sob demanda.";
  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4 sm:p-6">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
            Categoria 4 · Logística
          </p>
          <h3 className="text-lg font-semibold text-[#F0F4FC]">
            Viagens, passagens & pedágios
          </h3>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
          Em breve
        </span>
      </header>
      <EmBreve
        variant="inline"
        titulo="Viagens & pedágios — em breve"
        subtitulo={subtitulo}
      />
    </section>
  );
}
