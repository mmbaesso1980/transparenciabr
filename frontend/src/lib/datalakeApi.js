/**
 * URLs do datalake (Cloud Functions) — em produção no Hosting usa rewrites em /api/datalake/*.
 */

export function getDatalakeApiBase() {
  const env = import.meta.env.VITE_DATALAKE_API_BASE;
  if (env) return String(env).replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const h = window.location.hostname;
    if (h.endsWith("web.app") || h.endsWith("firebaseapp.com")) {
      return `${window.location.origin.replace(/\/$/, "")}/api/datalake`;
    }
  }
  return "https://southamerica-east1-transparenciabr.cloudfunctions.net";
}

function isHostingRewriteBase() {
  const b = getDatalakeApiBase();
  return b.includes("/api/datalake");
}

export function dashboardKpisUrl() {
  const base = getDatalakeApiBase();
  return isHostingRewriteBase()
    ? `${base}/dashboard-kpis`
    : `${base}/getDashboardKPIs`;
}

export function alvosUrl(qs) {
  const base = getDatalakeApiBase();
  const path = isHostingRewriteBase() ? `${base}/alvos` : `${base}/getAlvos`;
  return qs ? `${path}?${qs}` : path;
}

export function dossieCeapKpisUrl(politicoId) {
  const base = getDatalakeApiBase();
  const path = isHostingRewriteBase() ? `${base}/dossie-ceap` : `${base}/getDossieCeapKPIs`;
  return `${path}?id=${encodeURIComponent(politicoId)}`;
}
