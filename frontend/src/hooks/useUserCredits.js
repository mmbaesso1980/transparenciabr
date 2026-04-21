import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import {
  bootstrapAnonymousSession,
  getFirebaseApp,
  getFirebaseAuth,
  getFirestoreDb,
  ensureUsuarioDoc,
} from "../lib/firebase.js";

/**
 * Saldo em tempo real (`usuarios/{uid}`) após sessão Firebase (anónima por defeito).
 */
export function useUserCredits() {
  const [credits, setCredits] = useState(null);

  useEffect(() => {
    const app = getFirebaseApp();
    if (!app) {
      setCredits(0);
      return undefined;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      setCredits(0);
      return undefined;
    }

    let docUnsub;
    const authUnsub = onAuthStateChanged(auth, async (user) => {
      docUnsub?.();
      docUnsub = undefined;

      if (!user) {
        setCredits(null);
        try {
          await bootstrapAnonymousSession();
        } catch {
          setCredits(0);
        }
        return;
      }

      const db = getFirestoreDb();
      if (!db) {
        setCredits(0);
        return;
      }

      try {
        await ensureUsuarioDoc(user.uid);
      } catch {
        /* rules / rede */
      }

      const ref = doc(db, "usuarios", user.uid);
      docUnsub = onSnapshot(
        ref,
        (snap) => {
          const n = Number(snap.data()?.creditos ?? 0);
          setCredits(Number.isFinite(n) ? n : 0);
        },
        () => setCredits(0),
      );
    });

    return () => {
      authUnsub();
      docUnsub?.();
    };
  }, []);

  return credits;
}
