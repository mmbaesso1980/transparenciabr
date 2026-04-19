import { Lock } from "lucide-react";

const CREDITS_DEFAULT = 200;

/**
 * Sobreposição com vidro fosco quando o saldo não cobre o custo da análise.
 */
export default function PremiumGate({
  locked = true,
  children,
  creditsRequired = CREDITS_DEFAULT,
  currentCredits = 0,
  title = "Relatório analítico assistido",
  onPayCredits,
}) {
  if (!locked) {
    return children;
  }

  const missing = Math.max(0, creditsRequired - currentCredits);

  return (
    <div className="relative isolate min-h-[220px] w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)]">
      <div
        className="pointer-events-none select-none opacity-[0.22]"
        aria-hidden="true"
      >
        {children}
      </div>

      <div
        className="glass dashboard-panel absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl px-8 py-10 text-center"
        style={{
          backdropFilter: "blur(25px) saturate(180%)",
          WebkitBackdropFilter: "blur(25px) saturate(180%)",
        }}
      >
        <div className="flex size-14 items-center justify-center rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] shadow-[var(--shadow-elevated)]">
          <Lock className="size-7 text-[var(--accent-secondary)]" strokeWidth={1.75} />
        </div>
        <div>
          <p className="font-semibold tracking-tight text-[var(--text-primary)]">
            {title}
          </p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
            Esta camada consome{" "}
            <span className="font-mono font-semibold text-[var(--accent-warning)]">
              {creditsRequired}
            </span>{" "}
            créditos. Saldo atual:{" "}
            <span className="font-mono font-semibold text-[var(--accent-primary)]">
              {currentCredits}
            </span>
            {missing > 0 ? (
              <>
                {" "}
                — faltam{" "}
                <span className="font-mono font-semibold text-[var(--accent-warning)]">
                  {missing}
                </span>
                .
              </>
            ) : null}
          </p>
          <button
            type="button"
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-[var(--accent-danger)]/45 bg-[var(--accent-danger)]/10 px-6 py-3 text-sm font-semibold text-[var(--text-primary)] shadow-[var(--shadow-elevated)] transition hover:border-[var(--accent-warning)] hover:bg-[var(--bg-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
            onClick={() => onPayCredits?.()}
          >
            Utilizar {creditsRequired} créditos
          </button>
        </div>
      </div>
    </div>
  );
}
