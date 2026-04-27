import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

import { getFirebaseAuth } from "../lib/firebase.js";

/**
 * Lê os custom claims do utilizador autenticado em tempo real.
 *
 * Devolve um objecto:
 *   { loading, tier, isAdmin, isPremium, isGodMode, claims }
 *
 * `tier` é uma string ("free" | "premium" | "god_mode") definida pelo
 * Cloud Function `grantRole` (admin-only). NUNCA por hardcoding de e-mail
 * — qualquer leitor que veja "manusalt13@gmail.com" embebido no bundle
 * está a ler código antigo, e isso é uma regressão de segurança.
 *
 * Forçamos `idTokenResult(true)` no auth-state-change para garantir que
 * uma mudança de claim feita pelo backend é refletida sem o utilizador
 * precisar fazer logout/login.
 */
export function useUserClaims() {
  const [state, setState] = useState({
    loading: true,
    tier: "free",
    isAdmin: false,
    isPremium: false,
    isGodMode: false,
    claims: {},
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setState((s) => ({ ...s, loading: false }));
      return undefined;
    }

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({
          loading: false,
          tier: "free",
          isAdmin: false,
          isPremium: false,
          isGodMode: false,
          claims: {},
        });
        return;
      }
      try {
        const token = await user.getIdTokenResult(true);
        const claims = token.claims || {};
        const tier = typeof claims.tier === "string" ? claims.tier : "free";
        const isGodMode = tier === "god_mode";
        const isPremium = tier === "premium" || isGodMode;
        const isAdmin = claims.admin === true || isGodMode;
        setState({
          loading: false,
          tier,
          isAdmin,
          isPremium,
          isGodMode,
          claims,
        });
      } catch {
        setState({
          loading: false,
          tier: "free",
          isAdmin: false,
          isPremium: false,
          isGodMode: false,
          claims: {},
        });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
