/**
 * Ranking CEAP público (BigQuery → GCS) — mesmo payload do painel / universo.
 */

import { TBR_PUBLIC_RANKING_CEAP_JSON } from "./tbrPublicUrls.js";

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const truthy = (v) => v === true || String(v).toLowerCase() === "true";

function parseAmount(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).trim();
  const direct = Number(s);
  if (Number.isFinite(direct)) return direct;
  const br = s.replace(/\./g, "").replace(",", ".");
  const n = Number(br);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchPublicCeapRankingRows() {
  const res = await fetch(`${TBR_PUBLIC_RANKING_CEAP_JSON}?v=onda9`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`ranking_http_${res.status}`);
  const json = await res.json();
  const arr = Array.isArray(json?.parlamentares)
    ? json.parlamentares
    : Array.isArray(json)
      ? json
      : [];
  return arr
    .map((r, i) => {
      const nome = r.deputado || r.nome || "—";
      const idRaw = r.id ?? r.nu_deputado_id;
      const id =
        idRaw != null && String(idRaw).trim() !== ""
          ? String(idRaw).trim()
          : slugify(nome || `top-${i}`);
      const pct = parseAmount(r.pct_aproveitamento ?? r.pct ?? 0);
      const cota = parseAmount(
        r.total_brl ?? r.cota ?? r.valor_total_brl ?? r.gasto_total_brl ?? 0,
      );
      return {
        id,
        nome,
        partido: String(r.partido || "—").toUpperCase(),
        uf: String(r.uf || "—").toUpperCase(),
        cota,
        pct,
        meses_ativos: parseAmount(r.meses_ativos ?? 0),
        is_suplente: truthy(r.is_suplente),
      };
    })
    .filter((p) => p.nome !== "—" && p.cota > 0);
}
