import { useMemo } from "react";

import PoliticianOrb from "./PoliticianOrb.jsx";

/**
 * Avatar do usuário no estilo orbe da casa.
 *
 * Usa o mesmo componente PoliticianOrb (gradiente radial determinístico) com
 * iniciais sobrepostas. Identidade default é o uid do Firebase, então cada
 * usuário tem uma orbe única — mas neutra, sem semântica política, até que
 * personalize na página /perfil no futuro.
 *
 * @param {{
 *   user: { uid?: string, displayName?: string, email?: string },
 *   size?: number,
 *   className?: string,
 *   showInitials?: boolean,
 * }} props
 */
export default function UserOrb({
  user,
  size = 32,
  className = "",
  showInitials = true,
}) {
  const initials = useMemo(() => extractInitials(user), [user]);
  const identity = user?.uid || user?.email || "anonymous";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      aria-label={user?.displayName || user?.email || "Avatar"}
    >
      <PoliticianOrb
        identity={identity}
        score={0}
        size={size}
        withRing
        ariaLabel="Avatar do usuário"
      />
      {showInitials && initials ? (
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center font-semibold uppercase tracking-tight"
          style={{
            fontSize: Math.max(10, Math.round(size * 0.36)),
            color: "rgba(255,255,255,0.92)",
            textShadow: "0 1px 2px rgba(0,0,0,0.35)",
            letterSpacing: "-0.02em",
          }}
        >
          {initials}
        </span>
      ) : null}
    </span>
  );
}

function extractInitials(user) {
  if (!user) return "";
  const source = (user.displayName || user.email || "").trim();
  if (!source) return "";

  // Se tem espaço, pega primeira letra de até 2 palavras (Mauro Marcelo → MM)
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  // Email: pega primeiras 2 letras antes do @
  const emailLocal = source.split("@")[0] || "";
  return emailLocal.slice(0, 2).toUpperCase();
}
