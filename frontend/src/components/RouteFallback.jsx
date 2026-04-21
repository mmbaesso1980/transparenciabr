/** Fallback para rotas carregadas com React.lazy. */
export default function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-[#080B14] px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363D] border-t-[#58A6FF]" />
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-[#8B949E]">
          A carregar módulo…
        </p>
      </div>
    </div>
  );
}
