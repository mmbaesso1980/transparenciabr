/**
 * FolhaGabinete — Categoria canônica nº 3 do dossiê.
 *
 * Verifica composição da folha do gabinete parlamentar (nomeações, parentesco,
 * histórico tipo "rachadinha FLAVIO"). Pipeline em construção.
 */

import EmBreve from "./EmBreve.jsx";

export default function FolhaGabinete({ politicoNome }) {
  const subtitulo = politicoNome
    ? `Aurora ainda não consolidou a folha do gabinete de ${politicoNome} (servidores nomeados, parentesco, salários). Compre o dossiê premium para disparar a coleta sob demanda.`
    : "Aurora ainda não consolidou a folha do gabinete deste parlamentar. Compre o dossiê premium para disparar a coleta sob demanda.";
  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4 sm:p-6">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
            Categoria 3 · Folha do gabinete
          </p>
          <h3 className="text-lg font-semibold text-[#F0F4FC]">
            Servidores nomeados — auditoria
          </h3>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
          Em breve
        </span>
      </header>
      <EmBreve
        variant="inline"
        titulo="Folha do gabinete — em breve"
        subtitulo={subtitulo}
      />
    </section>
  );
}
