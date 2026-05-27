import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";

import { getFirestoreDb } from "../lib/firebase.js";

const SEVERITY_ORDER = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function severityRank(s) {
  return SEVERITY_ORDER[s] ?? 99;
}

/**
 * Lista incidentes ``maestro_incident_log`` (M11): ordenação por severidade
 * (CRITICAL primeiro) e filtro por ``status``.
 */
export default function IncidentLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const db = getFirestoreDb();
      if (!db) {
        if (!cancelled) {
          setErr("Firestore indisponível");
          setLoading(false);
        }
        return;
      }
      try {
        const snap = await getDocs(collection(db, "maestro_incident_log"));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!cancelled) {
          setRows(list);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (statusFilter !== "all") {
      r = r.filter((x) => (x.status || "").toLowerCase() === statusFilter);
    }
    return [...r].sort((a, b) => {
      const dr = severityRank(a.severity) - severityRank(b.severity);
      if (dr !== 0) return dr;
      const ta = a.detected_at?.seconds ?? 0;
      const tb = b.detected_at?.seconds ?? 0;
      return tb - ta;
    });
  }, [rows, statusFilter]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">A carregar incidentes…</p>;
  }
  if (err) {
    return <p className="text-sm text-destructive">Erro: {err}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="incident-status-filter">
          Estado
        </label>
        <select
          id="incident-status-filter"
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">Todos</option>
          <option value="open">open</option>
          <option value="contained">contained</option>
          <option value="retracted">retracted</option>
          <option value="closed">closed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="px-3 py-2 font-medium">Severidade</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Dossiê</th>
              <th className="px-3 py-2 font-medium">Sentinelas</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{row.incident_id || row.id}</td>
                <td className="px-3 py-2">{row.severity || "—"}</td>
                <td className="px-3 py-2">{row.status || "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.dossie_id || "—"}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {Array.isArray(row.sentinels) ? `${row.sentinels.length} hit(s)` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem incidentes para os filtros actuais.</p>
      ) : null}
    </div>
  );
}
