/**
 * TsePatrimonio — Categoria canônica nº 2 do dossiê.
 *
 * Cruza declarações de bens TSE (eleições anteriores) com variação patrimonial
 * declarada e indícios de subdeclaração. Pipeline ainda não rodou para todos os
 * parlamentares — exibe placeholder honesto até a Onda 1 (on-demand) processar.
 *
 * Filosofia: "Não fazemos denúncia — apresentamos fatos."
 */

import EmBreve from "./EmBreve.jsx";

export default function TsePatrimonio({ politicoNome }) {
  const subtitulo = politicoNome
    ? `Aurora ainda não cruzou as declarações TSE 2018/2022/2024 de ${politicoNome} com a variação patrimonial. Compre o dossiê premium para disparar a análise sob demanda.`
    : "Aurora ainda não cruzou as declarações TSE deste parlamentar com a variação patrimonial. Compre o dossiê premium para disparar a análise sob demanda.";
  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4 sm:p-6">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
            Categoria 2 · Patrimônio
          </p>
          <h3 className="text-lg font-semibold text-[#F0F4FC]">
            TSE — Declarações de bens
          </h3>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
          Em breve
        </span>
      </header>
      <EmBreve
        variant="inline"
        titulo="TSE Patrimônio — em breve"
        subtitulo={subtitulo}
      />
    </section>
  );
}
