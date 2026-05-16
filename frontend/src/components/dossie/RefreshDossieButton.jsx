import { useGenerateDossieOnDemand } from "../../hooks/useGenerateDossieOnDemand.js";

/**
 * Dispara coleta sob demanda (Onda 1). Débito alinhado ao produto na Cloud Function.
 */
export default function RefreshDossieButton({ politicoId }) {
  const { generate, loading, error, result } = useGenerateDossieOnDemand();
  const onClick = async () => {
    if (!politicoId || loading) return;
    if (
      !window.confirm(
        `Disparar nova coleta sob demanda? Isso debitará créditos (dossiê matador) e marcará o dossiê como em processamento.`,
      )
    )
      return;
    try {
      await generate(politicoId, { tipo: "dossie_matador" });
    } catch {
      /* erro no state */
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-cyan-200 transition hover:bg-cyan-400/20 disabled:opacity-50"
      >
        {loading ? "Agendando…" : "Atualizar agora"}
      </button>
      {error ? <span className="text-[10px] text-rose-300">{error}</span> : null}
      {result?.ok ? (
        <span className="text-[10px] text-emerald-300">
          Coleta agendada (job {String(result.jobId).slice(-12)}). Saldo: {result.saldoApos} cr.
        </span>
      ) : null}
    </div>
  );
}
