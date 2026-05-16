import BrandLogo from "../BrandLogo.jsx";

/**
 * Cabeçalho sticky do dossiê — contexto operacional e monitorização.
 */
export default function DossieHeader({
  photoAbs,
  nomeExibicao,
  partidoSigla,
  displayRecordId,
  politicoId,
  monitoringActive,
  onToggleMonitor,
  credits,
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-[#30363D] bg-[#0B0F1A]/93 backdrop-blur-lg">
      <div className="mx-auto flex min-w-0 max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
        <BrandLogo to="/" variant="dark" size="md" withGlow className="hidden md:flex" />
        {photoAbs ? (
          <img
            src={photoAbs}
            alt=""
            className="size-11 shrink-0 rounded-xl border border-[#30363D] object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1 basis-[min(100%,14rem)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
            Dossiê político completo
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="truncate text-3xl font-bold tracking-tight text-[#F0F4FC] md:text-4xl">
              {nomeExibicao || "—"}
            </h1>
            {partidoSigla ? (
              <span className="rounded-lg border border-[#30363D] bg-[#161B22]/90 px-2 py-0.5 text-xs font-semibold text-[#C9D1D9]">
                {partidoSigla}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-data text-[10px] text-[#484F58]">
            {displayRecordId ? `politicos/${displayRecordId}` : politicoId ? `rota: ${politicoId}` : "—"}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-[#4ADE80]/45 bg-[#4ADE80]/12 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4ADE80]">
          Operational
        </span>
        <button
          type="button"
          onClick={() => onToggleMonitor()}
          className={[
            "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold tracking-tight transition",
            monitoringActive
              ? "border-[#4ADE80]/45 bg-[#4ADE80]/12 text-[#4ADE80]"
              : "border-[#7DD3FC]/45 bg-[#7DD3FC]/10 text-[#7DD3FC] hover:bg-[#7DD3FC]/16",
          ].join(" ")}
        >
          <span aria-hidden="true">🔔</span>
          {monitoringActive ? "Ativo" : "Monitorizar"}
        </button>
        <div className="ml-auto text-right font-data text-xs text-[#8B949E]">
          <span className="block text-[10px] uppercase tracking-wider">Créditos</span>
          <span className="inline-flex max-w-[min(100vw,14rem)] flex-wrap items-center justify-end gap-x-2 gap-y-1">
            <span className="text-[#7DD3FC]">{credits === null ? "…" : credits}</span>
            <span className="text-[#484F58]">·</span>
            <span className="break-all text-[#C9D1D9]">{politicoId}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
