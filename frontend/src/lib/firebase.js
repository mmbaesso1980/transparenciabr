import { initializeApp, getApps } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

function buildConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

let cachedApp;
let cachedDb;

/** Uma única app Firebase (singleton). Retorna null se env incompleto. */
export function getFirebaseApp() {
  const cfg = buildConfig();
  if (!cfg?.projectId) return null;
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0] : initializeApp(cfg);
  }
  return cachedApp;
}

/** Instância Firestore (singleton). Retorna null se env ausente. */
export function getFirestoreDb() {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!cachedDb) {
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}

/** Alias exportado como `db` para consumo direto (idem a getFirestoreDb). */
export const db = getFirestoreDb;

/**
 * Coleção `politicos` — uma leitura em lote (`getDocs` = 1 leitura por documento na facturação Firestore).
 * @returns {Promise<Array<{ id: string } & Record<string, unknown>>>}
 */
export async function fetchPoliticosCollection() {
  const firestore = getFirestoreDb();
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, "politicos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Uma leitura — documento `politicos/{id}`.
 */
export async function fetchPoliticoById(politicoId) {
  const firestore = getFirestoreDb();
  if (!firestore || !politicoId) return null;
  const ref = doc(firestore, "politicos", politicoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

const politicoMatchesId = (row, politicoId) =>
  row?.politico_id === politicoId ||
  row?.politicoId === politicoId ||
  row?.ref_politico === politicoId;

/**
 * Alertas da coleção `alertas_bodes` associados ao parlamentar.
 */
export async function fetchAlertasForPolitico(politicoId, maxResults = 40) {
  const firestore = getFirestoreDb();
  if (!firestore || !politicoId) return [];

  try {
    const q1 = query(
      collection(firestore, "alertas_bodes"),
      where("politico_id", "==", politicoId),
      orderBy("criado_em", "desc"),
      limit(maxResults),
    );
    const snap = await getDocs(q1);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    /* índice composto pode não existir */
  }

  try {
    const q2 = query(
      collection(firestore, "alertas_bodes"),
      where("politico_id", "==", politicoId),
      limit(maxResults),
    );
    const snap = await getDocs(q2);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    /* fallback amplo */
  }

  try {
    const snap = await getDocs(
      query(collection(firestore, "alertas_bodes"), limit(250)),
    );
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((r) => politicoMatchesId(r, politicoId))
      .slice(0, maxResults);
  } catch {
    return [];
  }
}
