import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import { getFirestoreDb } from "../lib/firebase.ts";

/**
 * Saldo de créditos em tempo real (`usuarios/{docId}` ou variável de ambiente).
 */
export function useUserCredits() {
  const [credits, setCredits] = useState(null);
  const docId =
    import.meta.env.VITE_CREDITS_USER_DOC_ID?.trim() || "sessao_publica";

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db) {
      setCredits(0);
      return undefined;
    }
    const ref = doc(db, "usuarios", docId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const d = snap.data();
        const n = Number(d?.creditos ?? d?.saldo_creditos ?? d?.credits ?? 0);
        setCredits(Number.isFinite(n) ? n : 0);
      },
      () => setCredits(0),
    );
    return () => unsub();
  }, [docId]);

  return credits;
}
