import { NavLink } from "react-router-dom";

/** Logo em `public/assets/logo_transparenciabr.svg` ou `.png` (rename no deploy). */
export default function BrandLogo({ to = "/dashboard", className = "" }) {
  return (
    <NavLink
      to={to}
      className={`flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90 ${className}`}
      title="TransparênciaBR"
    >
      <img
        src="/assets/logo_transparenciabr.svg"
        alt="transparenciabr"
        className="h-7 w-auto md:h-8"
        width={200}
        height={40}
        loading="eager"
        decoding="async"
      />
    </NavLink>
  );
}
