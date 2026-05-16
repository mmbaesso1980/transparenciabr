import PremiumGate from "../PremiumGate.jsx";

/**
 * Camada premium (paywall) — Oráculo / PDF / teia preditiva.
 */
export default function UnlockGate({
  locked,
  creditsRequired,
  currentCredits,
  creditsLoading,
  godMode,
  onPayCredits,
  children,
}) {
  return (
    <PremiumGate
      locked={locked}
      creditsRequired={creditsRequired}
      currentCredits={currentCredits}
      creditsLoading={creditsLoading}
      godMode={godMode}
      onPayCredits={onPayCredits}
    >
      {children}
    </PremiumGate>
  );
}
