/**
 * PncpDetalhado — Categoria canônica nº 6 do dossiê.
 *
 * Detalha contratos PNCP cruzados com emendas/empresas-fachada. O HealthAuditSection
 * já entrega uma visão parcial; esta seção é a versão completa (k-means + ARIMA +
 * grafo de fornecedores). Pipeline em construção.
 */

import EmBreve from "./EmBreve.jsx";

export default function PncpDetalhado({ politicoNome }) {
  const subtitulo = politicoNome
    ? `Aurora ainda não consolidou o cruzamento PNCP completo de ${politicoNome} (k-means de empresas-fachada + ARIMA temporal + grafo de fornecedores). Compre o dossiê premium para disparar a coleta sob demanda.`
    : "Aurora ainda não consolidou o cruzamento PNCP completo (k-means + ARIMA + grafo de fornecedores). Compre o dossiê premium para disparar a coleta sob demanda.";
  return (
    <section className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4 sm:p-6">
      <header className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
            Categoria 6 · Contratos públicos
          </p>
          <h3 className="text-lg font-semibold text-[#F0F4FC]">
            PNCP — análise detalhada
          </h3>
        </div>
        <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-200">
          Em breve
        </span>
      </header>
      <EmBreve
        variant="inline"
        titulo="PNCP detalhado — em breve"
        subtitulo={subtitulo}
      />
    </section>
  );
}
