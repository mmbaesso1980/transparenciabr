import { collection, getDocs, limit, query } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";

import { getFirestoreDb } from "../lib/firebase.js";
import {
  normalizeDespesaCatalogoRow,
  pickNome,
  pickPartidoSigla,
} from "../utils/dataParsers.js";

const COLLECTION = "transparency_reports";

function normalizeSearch(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** @param {Array<Record<string, unknown>>} rows */
export function matchPoliticoFromRows(rows, rawQuery) {
  const needle = normalizeSearch(rawQuery);
  if (needle.length < 2) return null;
  const qTrim = String(rawQuery || "").trim();

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    if (id === qTrim) {
      const nome =
        pickNome(row) ||
        String(row.nome_parlamentar ?? row.nomeParlamentar ?? "").trim() ||
        id;
      return { id, nome: nome.slice(0, 120) };
    }
  }

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    const nome =
      pickNome(row) ||
      String(row.nome_parlamentar ?? row.nomeParlamentar ?? "").trim();
    if (!id || !nome) continue;
    const hay = normalizeSearch(nome);
    if (hay.includes(needle)) return { id, nome: nome.slice(0, 120) };
  }

  const tokens = needle.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    const nome =
      pickNome(row) ||
      String(row.nome_parlamentar ?? row.nomeParlamentar ?? "").trim();
    if (!id || !nome) continue;
    const hay = normalizeSearch(nome);
    if (tokens.every((t) => hay.includes(t))) return { id, nome: nome.slice(0, 120) };
  }

  return null;
}

/** @param {unknown} row */
function normalizePartyKey(row) {
  const raw = pickPartidoSigla(row);
  const s = String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (s.length >= 2) return s.slice(0, 12);
  return "";
}

/** Top despesas por valor para extrair fornecedores. */
function topSuppliersFromReport(row, politicoId, max = 3) {
  const cat =
    row?.investigacao_prisma_ceap?.despesas_ceap_catalogo ??
    row?.investigacao_prisma_ceap?.despesasCeapCatalogo;
  if (!Array.isArray(cat) || !politicoId) return [];
  const scored = cat
    .map((r, i) => normalizeDespesaCatalogoRow(r, i))
    .filter(Boolean)
    .sort((a, b) => {
      const va = a.rawValue ?? 0;
      const vb = b.rawValue ?? 0;
      if (vb !== va) return vb - va;
      return String(b.catalogSortDate || "").localeCompare(String(a.catalogSortDate || ""));
    });
  const seen = new Set();
  const out = [];
  for (const s of scored) {
    const key = String(s.titulo || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `sup_${politicoId}_${out.length}_${key.slice(0, 40).replace(/\s+/g, "_")}`,
      label: String(s.titulo || "Fornecedor").slice(0, 56),
      politicoId,
      rawValue: s.rawValue ?? 0,
    });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Monta { nodes, links } a partir de snapshots `transparency_reports` (Firestore).
 *
 * @param {number} maxDocs
 */
export function buildGraphFromReports(rows) {
  /** @type {Map<string, { id: string, label: string }>} */
  const parties = new Map();

  for (const row of rows) {
    let pk = normalizePartyKey(row);
    if (!pk) pk = "OUTROS";
    const partyId = `party_${pk}`;
    if (!parties.has(partyId)) {
      parties.set(partyId, { id: partyId, label: pk });
    }
  }

  /** @type {object[]} */
  const nodes = [];
  /** @type {object[]} */
  const links = [];

  const partyHue = (sigla) => {
    let h = 0;
    const s = String(sigla || "");
    for (let i = 0; i < s.length; i++) {
      h = (h + s.charCodeAt(i) * (i + 7)) % 360;
    }
    return 180 + (h % 160);
  };

  for (const [, p] of parties) {
    const hue = partyHue(p.label);
    nodes.push({
      id: p.id,
      label: p.label,
      tipo: "partido",
      tier: "grande",
      partyHue: hue,
      mass: 14,
    });
  }

  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id) continue;
    const nome =
      pickNome(row) ||
      String(row.nome_parlamentar ?? row.nomeParlamentar ?? row.apelido_publico ?? "").trim() ||
      `Parlamentar ${id}`;
    let pk = normalizePartyKey(row);
    if (!pk) pk = "OUTROS";
    const partyId = `party_${pk}`;

    const risk = Number(
      row.nivel_exposicao ??
        row.score_forense ??
        row.indice_risco ??
        row.metricas_k_means?.score_risco ??
        35,
    );
    const riskScore = Number.isFinite(risk) ? Math.min(100, Math.max(0, risk)) : 35;

    nodes.push({
      id: `pol_${id}`,
      label: nome.slice(0, 80),
      tipo: "politico",
      tier: "medio",
      politicoId: id,
      dossiePath: `/dossie/${encodeURIComponent(id)}`,
      riskScore,
      mass: 5,
    });

    if (parties.has(partyId)) {
      links.push({
        source: partyId,
        target: `pol_${id}`,
        kind: "afiliacao",
        risk: 18,
      });
    }

    const suppliers = topSuppliersFromReport(row, id, 3);
    for (const sup of suppliers) {
      nodes.push({
        id: sup.id,
        label: sup.label,
        tipo: "fornecedor",
        tier: "pequeno",
        politicoId: id,
        supplierOf: id,
        critical: true,
        riskScore: 88,
        mass: 2,
      });
      links.push({
        source: `pol_${id}`,
        target: sup.id,
        kind: "ceap",
        risk: Math.min(95, 55 + Math.min(40, (sup.rawValue || 0) / 5000)),
      });
    }
  }

  return { nodes, links };
}

/**
 * Carrega até `maxDocs` documentos de `transparency_reports` e devolve grafo derivado.
 */
export function useTransparencyReportsUniverso(maxDocs = 150) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const db = getFirestoreDb();
    if (!db) {
      setRows([]);
      setLoading(false);
      setError("firebase_unavailable");
      return undefined;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const q = query(collection(db, COLLECTION), limit(maxDocs));
        const snap = await getDocs(q);
        if (cancelled) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(list);
      } catch (e) {
        if (!cancelled) {
          setRows([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [maxDocs]);

  const graphData = useMemo(() => {
    if (!rows.length) return { nodes: [], links: [] };
    return buildGraphFromReports(rows);
  }, [rows]);

  const findPoliticoByQuery = useMemo(() => {
    return (rawQuery) => matchPoliticoFromRows(rows, rawQuery);
  }, [rows]);

  return {
    rows,
    graphData,
    loading,
    error,
    findPoliticoByQuery,
  };
}
