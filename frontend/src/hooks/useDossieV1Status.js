import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { getFirestoreDb } from "../lib/firebase.js";

/**
 * Listener em tempo real do estado do dossiê v1.0.
 *
 * Documento Firestore: `dossies_v1/{slug}`.
 *
 * Forma esperada:
 *   {
 *     status: "queued" | "running" | "done" | "error",
 *     alvo: string,
 *     started_at, finished_at,
 *     pdf_url, findings_count,
 *     agents: {
 *       "crew-dossie-forense-v1-identificacao": {
 *         status: "pending" | "running" | "done" | "error",
 *         output_preview, updated_at, error_message
 *       },
 *       ...
 *     },
 *     logs: Array<{ts, agent_id, message}>
 *   }
 *
 * Sem slug ou sem env Firestore o hook devolve estado vazio.
 */
export function useDossieV1Status(slug) {
  const [state, setState] = useState({
    loading: Boolean(slug),
    exists: false,
    status: null,
    alvo: null,
    agents: {},
    logs: [],
    pdfUrl: null,
    startedAt: null,
    finishedAt: null,
    findingsCount: null,
    error: null,
    raw: null,
  });

  useEffect(() => {
    if (!slug) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }
    const db = getFirestoreDb();
    if (!db) {
      setState((s) => ({ ...s, loading: false, error: "firestore_unavailable" }));
      return undefined;
    }

    const ref = doc(db, "dossies_v1", String(slug));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState({
            loading: false,
            exists: false,
            status: null,
            alvo: null,
            agents: {},
            logs: [],
            pdfUrl: null,
            startedAt: null,
            finishedAt: null,
            findingsCount: null,
            error: null,
            raw: null,
          });
          return;
        }
        const d = snap.data() || {};
        setState({
          loading: false,
          exists: true,
          status: d.status || null,
          alvo: d.alvo || d.alvo_nome || null,
          agents: d.agents && typeof d.agents === "object" ? d.agents : {},
          logs: Array.isArray(d.logs) ? d.logs.slice(-20) : [],
          pdfUrl: d.pdf_url || d.pdfUrl || null,
          startedAt: d.started_at || null,
          finishedAt: d.finished_at || null,
          findingsCount:
            typeof d.findings_count === "number" ? d.findings_count : null,
          error: d.error || null,
          raw: d,
        });
      },
      (err) => {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.code || err?.message || "snapshot_error",
        }));
      },
    );

    return () => unsub();
  }, [slug]);

  return state;
}

export default useDossieV1Status;
