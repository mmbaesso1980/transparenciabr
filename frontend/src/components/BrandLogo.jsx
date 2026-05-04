import { useId } from "react";
import { NavLink } from "react-router-dom";

const CYAN = "#38bdf8";
const OFF_WHITE = "#f8fafc";

const SIZE_MAP = {
  sm: { h: 24, icon: 22, wordmarkMax: 280 },
  md: { h: 32, icon: 28, wordmarkMax: 320 },
  lg: { h: 40, icon: 36, wordmarkMax: 360 },
};

/**
 * Logo adaptativa — anéis derivados de `public/assets/logo_transparenciabr.svg`.
 *
 * @param {{
 *   to?: string,
 *   asStatic?: boolean,
 *   className?: string,
 *   variant?: "full" | "dark" | "mono" | "icon",
 *   size?: "sm" | "md" | "lg",
 *   withGlow?: boolean,
 * }} props
 */
export default function BrandLogo({
  to = "/",
  asStatic = false,
  className = "",
  variant = "full",
  size = "md",
  withGlow = false,
}) {
  const gid = useId().replace(/:/g, "");
  const gradId = `tb-ring-${gid}`;
  const dims = SIZE_MAP[size] ?? SIZE_MAP.md;
  const showWordmark = variant !== "icon";
  const vbW = showWordmark ? 280 : 48;
  const vbH = 48;

  const glowClass = withGlow
    ? "drop-shadow-[0_0_14px_rgba(56,189,248,0.35)]"
    : "";

  const ringStroke =
    variant === "full"
      ? `url(#${gradId})`
      : variant === "mono"
        ? "rgba(248,250,252,0.92)"
        : CYAN;

  const innerRingStroke =
    variant === "full"
      ? `url(#${gradId})`
      : variant === "mono"
        ? "rgba(148,163,184,0.75)"
        : "rgba(56,189,248,0.45)";

  const wordmarkFill = variant === "full" ? "#e6edf3" : OFF_WHITE;

  const svg = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${vbW} ${vbH}`}
      fill="none"
      className={`block h-auto w-auto shrink-0 ${glowClass}`}
      style={{
        height: showWordmark ? dims.h : dims.icon,
        maxWidth: showWordmark ? `min(100%, ${dims.wordmarkMax}px)` : dims.icon,
      }}
      role="img"
      aria-label="TransparênciaBR"
    >
      {variant === "full" ? (
        <defs>
          <linearGradient id={gradId} x1="0%" y1="50%" x2="100%" y2="50%">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="28%" stopColor="#FDBA74" />
            <stop offset="52%" stopColor="#4ADE80" />
            <stop offset="78%" stopColor="#7DD3FC" />
            <stop offset="100%" stopColor="#FDE047" />
          </linearGradient>
          <radialGradient id={`${gradId}-core`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="60%" stopColor="#7DD3FC" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#7DD3FC" stopOpacity="0" />
          </radialGradient>
        </defs>
      ) : null}

      <g transform="translate(4,4)">
        <circle cx="20" cy="20" r="18" stroke={ringStroke} strokeWidth="3.5" fill="none" opacity="0.95" />
        <ellipse cx="20" cy="20" rx="18" ry="9" stroke={ringStroke} strokeWidth="2" fill="none" opacity="0.55" transform="rotate(-25 20 20)" />
        <circle cx="20" cy="20" r="8" stroke={innerRingStroke} strokeWidth="2" fill="none" opacity={variant === "full" ? 0.7 : 0.6} />
        {variant === "full" ? (
          <circle cx="20" cy="20" r="3.2" fill={`url(#${gradId}-core)`} />
        ) : (
          <circle cx="20" cy="20" r="3.2" fill={CYAN} fillOpacity="0.65" />
        )}
      </g>

      {showWordmark ? (
        <text
          x="52"
          y="32"
          fill={wordmarkFill}
          fontFamily="Inter, system-ui, sans-serif"
          fontSize="22"
          fontWeight="600"
          letterSpacing="-0.02em"
        >
          transparenciabr
        </text>
      ) : null}
    </svg>
  );

  const inner = (
    <>
      {svg}
      <span className="sr-only">TransparênciaBR</span>
    </>
  );

  const wrapClass = `flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90 ${className}`;

  if (asStatic) {
    return <span className={wrapClass}>{inner}</span>;
  }

  return (
    <NavLink to={to} className={wrapClass} title="TransparênciaBR">
      {inner}
    </NavLink>
  );
}
