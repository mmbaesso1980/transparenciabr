import { Lock } from "lucide-react";
import { useState } from "react";

const CREDITS_DEFAULT = 200;

/**
 * Sobreposição com vidro fosco até débito atómico dos créditos no Firestore.
 */
export default function PremiumGate({
  locked = true,
  children,
  creditsRequired = CREDITS_DEFAULT,
  currentCredits = 0,
  creditsLoading = false,
  title = "Motor Forense TransparênciaBR — relatório premium",
  onPayCredits,
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  if (!locked) {
    return children;
  }

  const missing = Math.max(0, creditsRequired - currentCredits);
  const canPay =
    !creditsLoading &&
    creditsRequired > 0 &&
    currentCredits >= creditsRequired &&
    typeof onPayCredits === "function";

  async function handlePay() {
    if (!canPay || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await Promise.resolve(onPayCredits());
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : typeof e === "string" ? e : "debitc_failed";
      setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative isolate min-h-[220px] w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)]">
      <div
        className="pointer-events-none select-none opacity-[0.08] blur-md saturate-50"
        aria-hidden="true"
      >
        {children}
      </div>

      <div
        className="glass dashboard-panel absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl px-8 py-10 text-center"
        style={{
          backdropFilter: "blur(48px) saturate(200%)",
          WebkitBackdropFilter: "blur(48px) saturate(200%)",
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
            créditos (débito atómico no servidor). Saldo atual:{" "}
            <span className="font-mono font-semibold text-[var(--accent-primary)]">
              {creditsLoading ? "…" : currentCredits}
            </span>
            {!creditsLoading && missing > 0 ? (
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
          {err ? (
            <p className="mt-3 max-w-md text-xs text-[#f85149]">{err}</p>
          ) : null}
          <button
            type="button"
            disabled={!canPay || busy}
            className="mt-6 inline-flex items-center justify-center rounded-xl border border-[var(--accent-danger)]/45 bg-[var(--accent-danger)]/10 px-6 py-3 text-sm font-semibold text-[var(--text-primary)] shadow-[var(--shadow-elevated)] transition enabled:hover:border-[var(--accent-warning)] enabled:hover:bg-[var(--bg-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-45"
            onClick={() => void handlePay()}
          >
            {busy
              ? "A processar…"
              : missing > 0
                ? "Saldo insuficiente"
                : `Utilizar ${creditsRequired} créditos`}
          </button>
        </div>
      </div>
    </div>
  );
}
