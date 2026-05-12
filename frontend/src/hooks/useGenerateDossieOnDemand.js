/**
 * useGenerateDossieOnDemand — Mutation que dispara a CF callable.
 *
 * Onda 1 — pay-per-dossier. Debita créditos e enfileira job de coleta
 * (a coleta real fica para Onda 4). UI usa este hook no botão "Atualizar
 * agora" do DossiePage e na CTA do PoliticoPage (quando o usuário já estiver
 * logado e quiser disparar uma re-coleta sem ir pelo Stripe).
 */

import { useCallback, useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

import { getFirebaseApp } from "../lib/firebase.js";

export function useGenerateDossieOnDemand() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const generate = useCallback(async (politicoId) => {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const app = getFirebaseApp();
      if (!app) throw new Error("Firebase ainda não está pronto.");
      const functions = getFunctions(app, "southamerica-east1");
      const callable = httpsCallable(functions, "generateDossieOnDemand");
      const res = await callable({ politicoId });
      const payload = res?.data ?? null;
      setResult(payload);
      return payload;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { generate, loading, error, result };
}
