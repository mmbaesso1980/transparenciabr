import { doc, getDoc } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

import { getFirebaseApp, getFirestoreDb } from "./firebase.js";

/**
 * Lê flags de desbloqueio gravadas pela Cloud Function `unlockPoliticoData`.
 * @param {string} uid
 * @param {string} politicoId
 * @returns {Promise<{ ceap_full: boolean; emendas_full: boolean }>}
 */
export async function fetchPoliticoUnlockSnapshot(uid, politicoId) {
  const db = getFirestoreDb();
  const cleanUid = String(uid || "").trim();
  const cleanPid = String(politicoId || "").trim();
  if (!db || !cleanUid || !cleanPid) {
    return { ceap_full: false, emendas_full: false };
  }
  const ref = doc(db, "usuarios", cleanUid, "politico_unlocks", cleanPid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ceap_full: false, emendas_full: false };
  const d = snap.data() || {};
  return {
    ceap_full: d.ceap_full === true,
    emendas_full: d.emendas_full === true,
  };
}

/**
 * @param {string} politicoId
 * @param {"ceap"|"emendas"} feature
 */
export async function unlockPoliticoDataCallable(politicoId, feature) {
  const app = getFirebaseApp();
  if (!app) throw new Error("Firebase não configurado.");
  const functions = getFunctions(app, "southamerica-east1");
  const fn = httpsCallable(functions, "unlockPoliticoData");
  const res = await fn({
    politicoId: String(politicoId || "").trim(),
    feature,
  });
  return res?.data ?? null;
}
