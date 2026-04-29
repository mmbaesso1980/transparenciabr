import { useId, useMemo } from "react";
import { getPoliticianOrbStops } from "../utils/politicianColor.js";

/**
 * Orbe 2D estilo data.gov.uk — gradiente radial bicolor único por político.
 *
 * Geração determinística: a mesma identidade (CPF/ID) sempre produz a mesma orbe.
 * O score modula saturação/brilho — limpo é pastel, crítico é vibrante e profundo.
 *
 * @param {{
 *   identity: string|number,
 *   score?: number,
 *   size?: number,
 *   className?: string,
 *   ariaLabel?: string,
 *   withRing?: boolean,
 * }} props
 */
export default function PoliticianOrb({
  identity,
  score = 0,
  size = 56,
  className = "",
  ariaLabel,
  withRing = false,
}) {
  const gid = useId().replace(/:/g, "");
  const { inner, outer, accent } = useMemo(
    () => getPoliticianOrbStops(identity, score),
    [identity, score]
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ariaLabel ?? "Orbe identidade política"}
      className={className}
    >
      <defs>
        <radialGradient id={`orb-${gid}`} cx="35%" cy="35%" r="75%">
          <stop offset="0%" stopColor={inner} stopOpacity="0.98" />
          <stop offset="55%" stopColor={accent} stopOpacity="0.92" />
          <stop offset="100%" stopColor={outer} stopOpacity="1" />
        </radialGradient>
        <radialGradient id={`hl-${gid}`} cx="32%" cy="28%" r="22%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill={`url(#orb-${gid})`} />
      <circle cx="50" cy="50" r="48" fill={`url(#hl-${gid})`} />
      {withRing ? (
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1"
        />
      ) : null}
    </svg>
  );
}
