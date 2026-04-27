import { initializeApp, getApps } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInAnonymously,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

/**
 * SECOPS — Nenhum apiKey em texto plano. Toda a configuração tem de vir
 * estritamente das variáveis de ambiente VITE_FIREBASE_*. Se a chave
 * não estiver presente, falhamos cedo (fail-fast) para evitar que um
 * bundle saia para produção com credenciais hardcoded.
 */
const REQUIRED_ENV = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const MISSING_ENV_KEYS = Object.entries(REQUIRED_ENV)
  .filter(([, value]) => !value || String(value).trim() === "")
  .map(([key]) => `VITE_FIREBASE_${camelToScreamingSnake(key)}`);

if (MISSING_ENV_KEYS.length > 0) {
  const message =
    `[firebase.js] Configuração inválida: as seguintes variáveis de ambiente ` +
    `estão ausentes ou vazias: ${MISSING_ENV_KEYS.join(", ")}. ` +
    `Não há fallback de chaves em código cliente — preencha o arquivo .env / Secret Manager.`;
  // Fail-fast: aborta o boot do bundle em vez de cair em fallback inseguro.
  throw new Error(message);
}

export const firebaseConfig = Object.freeze({ ...REQUIRED_ENV });

function camelToScreamingSnake(input) {
  return String(input)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
}

function buildConfig() {
  return firebaseConfig;
}

let cachedApp;
let cachedDb;
let cachedAuth;

/** Uma única app Firebase (singleton). */
export function getFirebaseApp() {
  const cfg = buildConfig();
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

/** Auth (singleton). */
export function getFirebaseAuth() {
  const app = getFirebaseApp();
  if (!app) return null;
  if (!cachedAuth) {
    cachedAuth = getAuth(app);
  }
  return cachedAuth;
}

/**
 * Cota freemium não-cumulativa (300/dia). Foi 320 antes; G.O.A.T. patch
 * reduziu para 300 com reset diário (ver `ensureUsuarioDoc`).
 */
export const DAILY_FREEMIUM_CREDITS = 300;

/** Email do Comandante — perfil GOD blindado. */
const GOD_MODE_EMAIL = "manusalt13@gmail.com";

/** Calcula a data ISO YYYY-MM-DD do "hoje" (timezone do dispositivo). */
function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isGodEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase() === GOD_MODE_EMAIL;
}

/**
 * Garante sessão anónima + documento `usuarios/{uid}` para leitura de créditos e débitos.
 */
export async function bootstrapAnonymousSession() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  const user = auth.currentUser;
  if (user?.uid) {
    await ensureUsuarioDoc(user.uid, { email: user.email });
  }
  return auth.currentUser;
}

/**
 * Garante o documento `usuarios/{uid}` aplicando:
 *   1. Pilar 2.1 — Perfil GOD para `manusalt13@gmail.com`
 *      (creditos: 9999, creditos_ilimitados: true, isAdmin: true, role: "admin").
 *   2. Pilar 2.2 — Cota freemium diária 300 (não-cumulativa).
 *   3. Pilar 2.3 — Reset diário: se `last_login_date` mudou, repõe 300.
 *
 * Importante: o cliente nunca pode escalar privilégios em rotas/usuários
 * que não sejam o seu (`request.auth.uid == userId`) e o e-mail GOD
 * é validado no servidor pela Cloud Function/regra. Aqui apenas
 * preenchemos os campos para o operador autorizado.
 */
export async function ensureUsuarioDoc(uid, options = {}) {
  const firestore = getFirestoreDb();
  if (!firestore || !uid) return;
  const auth = getFirebaseAuth();
  const user = auth?.currentUser;
  const email = (options.email ?? user?.email ?? "").toString();
  const today = todayIsoDate();
  const ref = doc(firestore, "usuarios", uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (isGodEmail(email)) {
      await setDoc(ref, {
        email,
        creditos: 9999,
        creditos_ilimitados: true,
        isAdmin: true,
        role: "admin",
        last_login_date: today,
        updated_at: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        email: email || null,
        creditos: DAILY_FREEMIUM_CREDITS,
        creditos_ilimitados: false,
        isAdmin: false,
        role: "user",
        last_login_date: today,
        updated_at: serverTimestamp(),
      });
    }
    return;
  }

  const data = snap.data() || {};
  const patch = {};

  if (isGodEmail(email)) {
    if (data.creditos_ilimitados !== true) patch.creditos_ilimitados = true;
    if (data.isAdmin !== true) patch.isAdmin = true;
    if (data.role !== "admin") patch.role = "admin";
    if (Number(data.creditos ?? 0) < 9999) patch.creditos = 9999;
  } else {
    if (data.last_login_date !== today) {
      patch.creditos = DAILY_FREEMIUM_CREDITS;
      patch.last_login_date = today;
    }
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = serverTimestamp();
    try {
      await updateDoc(ref, patch);
    } catch {
      /* permissão / rede */
    }
  }
}

/**
 * Débito atómico de créditos (`runTransaction`). Alinhar `amount` à função oracle nas rules (200).
 */
export async function deductCredits(amount) {
  const firestore = getFirestoreDb();
  const auth = getFirebaseAuth();
  if (!firestore || !auth?.currentUser) {
    throw new Error("auth_required");
  }
  const uid = auth.currentUser.uid;
  const ref = doc(firestore, "usuarios", uid);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error("usuario_doc_missing");
    }
    const prev = Number(snap.data()?.creditos ?? 0);
    if (!Number.isFinite(prev) || prev < amount) {
      throw new Error("insufficient_credits");
    }
    tx.update(ref, {
      creditos: prev - amount,
      updated_at: serverTimestamp(),
    });
  });
}

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

function _pickUfFromPolitico(row) {
  const u = row?.uf ?? row?.sigla_uf ?? row?.UF ?? row?.estado;
  if (typeof u !== "string") return "";
  const t = u.trim().toUpperCase();
  return t.length >= 2 ? t.slice(0, 2) : "";
}

/**
 * Mapa `politico_id` → UF (2 letras) a partir da coleção `politicos`.
 */
export async function fetchPoliticoUfMap() {
  const rows = await fetchPoliticosCollection();
  /** @type {Record<string, string>} */
  const out = {};
  for (const r of rows) {
    const uf = _pickUfFromPolitico(r);
    if (r?.id && uf) out[String(r.id)] = uf;
  }
  return out;
}

function _criadoEmMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

/**
 * Lista recente na coleção plana `alertas_bodes`.
 */
export async function fetchAlertasBodesRecent(limitCount = 400) {
  const firestore = getFirestoreDb();
  if (!firestore) return [];

  try {
    const q1 = query(
      collection(firestore, "alertas_bodes"),
      orderBy("criado_em", "desc"),
      limit(limitCount),
    );
    const snap = await getDocs(q1);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    try {
      const q2 = query(
        collection(firestore, "alertas_bodes"),
        limit(limitCount),
      );
      const snap = await getDocs(q2);
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => _criadoEmMs(b.criado_em) - _criadoEmMs(a.criado_em));
    } catch {
      return [];
    }
  }
}

/**
 * Agrega contagens por UF usando o mapa vindo de `fetchPoliticoUfMap`.
 */
/**
 * Login Google — necessário para o painel /radar/dossiers (UID estável vs. anónimo).
 */
export async function signInWithGoogle() {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("firebase_auth_unavailable");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, provider);
  return auth.currentUser;
}

/**
 * Login com e-mail e senha (Firebase Auth).
 */
export async function signInWithEmail(email, password) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("firebase_auth_unavailable");
  await signInWithEmailAndPassword(auth, email, password);
  return auth.currentUser;
}

/**
 * Cria conta com e-mail e senha (Firebase Auth).
 */
export async function signUpWithEmail(email, password) {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error("firebase_auth_unavailable");
  await createUserWithEmailAndPassword(auth, email, password);
  return auth.currentUser;
}

/**
 * Logout — encerra a sessão Firebase atual.
 */
export async function signOut() {
  const auth = getFirebaseAuth();
  if (!auth) return;
  await firebaseSignOut(auth);
}

/**
 * QG Advocacia — `radar_dossiers` (operador = uid).
 */
export async function fetchRadarDossiersForOwner(uid, maxResults = 500) {
  const firestore = getFirestoreDb();
  if (!firestore || !uid) return [];
  try {
    const q1 = query(
      collection(firestore, "radar_dossiers"),
      where("uid_proprietario", "==", uid),
      limit(maxResults),
    );
    const snap = await getDocs(q1);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/**
 * Radar comercial — `radar_comercial`.
 */
export async function fetchRadarComercialForOwner(uid, maxResults = 500) {
  const firestore = getFirestoreDb();
  if (!firestore || !uid) return [];
  try {
    const q1 = query(
      collection(firestore, "radar_comercial"),
      where("uid_proprietario", "==", uid),
      limit(maxResults),
    );
    const snap = await getDocs(q1);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

export function aggregateAlertCountsByUf(alertas, ufByPoliticoId) {
  /** @type {Record<string, number>} */
  const counts = {};
  if (!Array.isArray(alertas)) return counts;
  for (const a of alertas) {
    const pid = String(a.politico_id ?? a.parlamentar_id ?? "").trim();
    if (!pid) continue;
    const uf = ufByPoliticoId[pid];
    if (!uf) continue;
    counts[uf] = (counts[uf] ?? 0) + 1;
  }
  return counts;
}
