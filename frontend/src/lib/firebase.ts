import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
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
  type Firestore,
} from "firebase/firestore";

export function isFirebaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
}

function requireFirebaseEnv(): void {
  if (!import.meta.env.VITE_FIREBASE_API_KEY) {
    throw new Error(
      "Firebase: defina VITE_FIREBASE_API_KEY (e demais VITE_FIREBASE_* no build).",
    );
  }
}

function buildConfig() {
  requireFirebaseEnv();
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

let cachedApp: FirebaseApp | undefined;
let cachedDb: Firestore | undefined;

/** Uma única app Firebase (singleton). */
export function getFirebaseApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null;
  const cfg = buildConfig();
  if (!cfg.projectId) return null;
  if (!cachedApp) {
    cachedApp = getApps().length > 0 ? getApps()[0]! : initializeApp(cfg);
  }
  return cachedApp;
}

/** Instância Firestore (singleton). */
export function getFirestoreDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!cachedDb) {
    cachedDb = getFirestore(app);
  }
  return cachedDb;
}

export const db = getFirestoreDb;

/**
 * Coleção `politicos` — uma consulta em lote.
 */
export async function fetchPoliticosCollection(): Promise<
  Array<{ id: string } & Record<string, unknown>>
> {
  const firestore = getFirestoreDb();
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, "politicos"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchPoliticoById(
  politicoId: string | undefined,
): Promise<({ id: string } & Record<string, unknown>) | null> {
  const firestore = getFirestoreDb();
  if (!firestore || !politicoId) return null;
  const ref = doc(firestore, "politicos", politicoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

const politicoMatchesId = (
  row: Record<string, unknown>,
  politicoId: string,
): boolean =>
  row?.politico_id === politicoId ||
  row?.politicoId === politicoId ||
  row?.ref_politico === politicoId;

export async function fetchAlertasForPolitico(
  politicoId: string | undefined,
  maxResults = 40,
): Promise<Array<{ id: string } & Record<string, unknown>>> {
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
