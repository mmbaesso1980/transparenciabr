import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import {
  getFirebaseApp,
  getFirebaseAuth,
  getFirestoreDb,
  ensureUsuarioDoc,
} from "../lib/firebase.js";
import { isFrontendGodModeBypass } from "../lib/godModeEnv.js";

/** Interpreta `creditos` vindo do Firestore (número ou string pt-BR, ex.: "7.000"). */
function parseUsuarioCreditos(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (hasComma) {
    return Number(s.replace(",", "."));
  }
  if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    return Number(s.replace(/\./g, ""));
  }
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Saldo em tempo real (`usuarios/{uid}`) após sessão Firebase.
 * Lê `creditos` (com fallbacks de nomes legados) e `nome_exibicao` / `nome` para exibição no perfil.
 * Sem login explícito, não há utilizador nem subscrição de créditos.
 */
export function useUserCredits() {
  const [credits, setCredits] = useState(null);
  const [godMode, setGodMode] = useState(false);
  const [unlimited, setUnlimited] = useState(false);
  const [user, setUser] = useState(null);
  const [profileDisplayName, setProfileDisplayName] = useState(null);

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
        setUser(null);
        setGodMode(false);
        setUnlimited(false);
        setCredits(null);
        setProfileDisplayName(null);
        return;
      }
      setUser(user);
      try {
        const token = await user.getIdTokenResult(true);
        const claims = token.claims || {};
        const tierIsGod = claims.tier === "god_mode";
        const legacyGod = claims.godMode === true;
        setGodMode(tierIsGod || legacyGod || isFrontendGodModeBypass(user));
      } catch {
        setGodMode(false);
      }

      const db = getFirestoreDb();
      if (!db) {
        setCredits(0);
        return;
      }

      try {
        await ensureUsuarioDoc(user.uid, {
          email: user.email,
          displayName: user.displayName || undefined,
        });
      } catch {
        /* rules / rede */
      }

      const ref = doc(db, "usuarios", user.uid);
      docUnsub = onSnapshot(
        ref,
        (snap) => {
          const d = snap.data() ?? {};
          const raw =
            d.creditos ??
            d.credito ??
            d.creditos_balance ??
            d.saldo_creditos ??
            d.saldo ??
            0;
          const n = parseUsuarioCreditos(raw);
          setCredits(Number.isFinite(n) ? n : 0);
          setUnlimited(d.creditos_ilimitados === true);
          const nameFromDoc = [
            d.nome_exibicao,
            d.nome,
            d.nome_usuario,
            d.displayName,
            d.apelido,
          ]
            .map((x) => String(x ?? "").trim())
            .find(Boolean);
          setProfileDisplayName(
            nameFromDoc || (user?.displayName ? String(user.displayName).trim() : null) || null,
          );
        },
        () => {
          setCredits(0);
          setUnlimited(false);
          setProfileDisplayName(null);
        },
      );
    });

    return () => {
      authUnsub();
      docUnsub?.();
    };
  }, []);

  return { credits, godMode, unlimited, user, profileDisplayName };
}
