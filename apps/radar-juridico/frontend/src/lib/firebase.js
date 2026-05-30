/**
 * Firebase config — Radar Jurídico INSS
 *
 * Reutiliza a mesma configuração Firebase do app principal.
 * As env vars são injetadas pelo Vite via .env.local.
 *
 * TODO(maestro): criar .env.local com as variáveis abaixo
 * (copiar do frontend principal .env.example):
 *
 *   VITE_FIREBASE_API_KEY=...
 *   VITE_FIREBASE_AUTH_DOMAIN=transparenciabr.firebaseapp.com
 *   VITE_FIREBASE_PROJECT_ID=transparenciabr
 *   VITE_FIREBASE_STORAGE_BUCKET=transparenciabr.appspot.com
 *   VITE_FIREBASE_MESSAGING_SENDER_ID=...
 *   VITE_FIREBASE_APP_ID=...
 *   VITE_BACKEND_URL=https://radar-juridico-api-xxxxxx-uc.a.run.app
 */

import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Evita inicializar múltiplas vezes em HMR (Vite dev)
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);
export default app;
