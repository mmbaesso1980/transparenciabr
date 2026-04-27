/**
 * Bypass frontend de paywall / quotas para operadores (env + UID admin pré-configurado).
 * Claims `god_mode` no token continuam a ter prioridade em `useUserCredits`.
 */
export function isFrontendGodModeBypass(user) {
  const raw = String(import.meta.env?.VITE_GOD_MODE ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;

  const adminUid = String(import.meta.env?.VITE_RADAR_ADMIN_UID ?? "").trim();
  const uid = user && typeof user.uid === "string" ? user.uid.trim() : "";
  if (adminUid && uid && adminUid === uid) return true;

  return false;
}
