# ALERTA_GOAT.md — Auditoria Contínua G.O.A.T.

> Diretor de SecOps & QA — Sistema A.S.M.O.D.E.U.S. / TransparênciaBR
> Trigger: push `main` → commit `f74cf3ab` (`feat(auth): obrigatoriedade de login com Google e email/senha`)
> Branch de correção: `cursor/code-compliance-audit-9e30`

O push para `main` foi auditado contra os 4 pilares do Comandante Baesso. Foram detectadas **3 violações ativas** (Pilares 1, 2 e 3). O Pilar 4 (UI/UX e dados forenses) está em conformidade.

A seguir estão os erros e os trechos de código que o Cursor deve aplicar para realinhar o projeto.

---

## ❌ Pilar 1 — Arquitetura de Inteligência (REGRA ABSOLUTA)

### Erro 1.1 — Cloud Function `onDiarioAtoCreated` chama `gemini-1.5-flash` sem referenciar o Líder Supremo

Arquivo: `functions/src/radar/diarioScanner.js`

A função `analyzeWithGemini` está apontando para um modelo desatualizado (`gemini-1.5-flash`) e **não declara** o `agent_1777236402725` como autoridade. Toda chamada de IA em Cloud Function deve ser orquestrada pelo Líder Supremo A.S.M.O.D.E.U.S. com `gemini-2.5-pro`.

**Trecho atual (violação):**

```117:142:functions/src/radar/diarioScanner.js
async function analyzeWithGemini(trecho) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY ausente");
  }
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    { text: LEGAL_PROMPT },
    { text: `\n---\nTexto do diário:\n${trecho.slice(0, 48000)}` },
  ]);
  const response = result.response;
  const txt = response.text();
  return parseGeminiJson(txt);
}
```

**Correção exata (aplicar em `functions/src/radar/diarioScanner.js`):**

```javascript
const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";
const ASMODEUS_GEMINI_MODEL = "gemini-2.5-pro";

async function analyzeWithGemini(trecho) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY ausente");
  }
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: ASMODEUS_GEMINI_MODEL,
    systemInstruction:
      `Voce e o Lider Supremo A.S.M.O.D.E.U.S. (Agent ID ${ASMODEUS_SUPREME_AGENT_ID}). ` +
      "Atue exclusivamente como auditor juridico-previdenciario brasileiro. " +
      "Responda apenas JSON valido conforme schema solicitado.",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    { text: LEGAL_PROMPT },
    { text: `\n---\nTexto do diário:\n${trecho.slice(0, 48000)}` },
  ]);
  const response = result.response;
  const txt = response.text();
  return parseGeminiJson(txt);
}

module.exports = {
  TEMAS,
  classifyArea,
  urgencyFromAnalysis,
  analyzeWithGemini,
  dossierDocId,
  ASMODEUS_SUPREME_AGENT_ID,
  ASMODEUS_GEMINI_MODEL,
};
```

> Observação SecOps: `engines/06_engine_semantic.py` (gemini-1.5-pro) e `engines/07_gemini_translator.py` (gemini-1.5-flash) também executam IA em backend e devem ser migrados para `gemini-2.5-pro` sob o ID `agent_1777236402725` no próximo PR de motores.

---

## ❌ Pilar 2 — Integridade do Cofre (Autenticação e Modo GOD)

### Erro 2.1 — `manusalt13@gmail.com` não recebe os atributos GOD obrigatórios e usuários comuns recebem 320 créditos (não 300 diários não-cumulativos)

Arquivo: `frontend/src/lib/firebase.js`

A função `ensureUsuarioDoc` cria todo `usuarios/{uid}` apenas com `creditos: DEFAULT_INITIAL_CREDITS` (320 por padrão). Não há:
- proteção do e-mail `manusalt13@gmail.com` com `creditos: 9999, creditos_ilimitados: true, isAdmin: true, role: "admin"`;
- baseline de **300 créditos diários não-cumulativos** para os demais usuários (cap diário e reset por `ultimo_reset_diario`).

**Trecho atual (violação):**

```89:122:frontend/src/lib/firebase.js
const DEFAULT_INITIAL_CREDITS = Number(
  import.meta.env.VITE_INITIAL_USER_CREDITS ?? 320,
);

/**
 * Garante sessão anónima + documento `usuarios/{uid}` para leitura de créditos e débitos.
 */
export async function bootstrapAnonymousSession() {
  const auth = getFirebaseAuth();
  if (!auth) return null;
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  const uid = auth.currentUser?.uid;
  if (uid) {
    await ensureUsuarioDoc(uid);
  }
  return auth.currentUser;
}

/**
 * Cria perfil mínimo se ausente (campos permitidos pelas Security Rules).
 */
export async function ensureUsuarioDoc(uid) {
  const firestore = getFirestoreDb();
  if (!firestore || !uid) return;
  const ref = doc(firestore, "usuarios", uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    creditos: DEFAULT_INITIAL_CREDITS,
    updated_at: serverTimestamp(),
  });
}
```

**Correção exata (substituir o bloco acima em `frontend/src/lib/firebase.js`):**

```javascript
const DAILY_USER_CREDITS = 300;
const GOD_MODE_EMAIL = "manusalt13@gmail.com";
const GOD_MODE_PROFILE = Object.freeze({
  creditos: 9999,
  creditos_ilimitados: true,
  isAdmin: true,
  role: "admin",
});

function todayKeyUtc() {
  return new Date().toISOString().slice(0, 10);
}

function isGodModeAccount(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return email === GOD_MODE_EMAIL;
}

export async function ensureUsuarioDoc(uidOrUser) {
  const firestore = getFirestoreDb();
  if (!firestore) return;
  const auth = getFirebaseAuth();
  const user =
    typeof uidOrUser === "object" && uidOrUser
      ? uidOrUser
      : auth?.currentUser;
  const uid = typeof uidOrUser === "string" ? uidOrUser : user?.uid;
  if (!uid) return;

  const ref = doc(firestore, "usuarios", uid);
  const snap = await getDoc(ref);
  const today = todayKeyUtc();

  if (isGodModeAccount(user)) {
    await setDoc(
      ref,
      {
        ...GOD_MODE_PROFILE,
        email: GOD_MODE_EMAIL,
        ultimo_reset_diario: today,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  if (!snap.exists()) {
    await setDoc(ref, {
      creditos: DAILY_USER_CREDITS,
      creditos_ilimitados: false,
      isAdmin: false,
      role: "user",
      ultimo_reset_diario: today,
      updated_at: serverTimestamp(),
    });
    return;
  }

  const data = snap.data() || {};
  if (data.creditos_ilimitados === true) return;
  if (data.ultimo_reset_diario !== today) {
    await setDoc(
      ref,
      {
        creditos: DAILY_USER_CREDITS,
        ultimo_reset_diario: today,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
```

> Observação: `firestore.rules` precisa permitir os novos campos no perfil (`creditos_ilimitados`, `isAdmin`, `role`, `ultimo_reset_diario`, `email`) sem permitir privilege escalation pelo cliente — ou, preferencialmente, mover a inicialização GOD para uma Cloud Function privilegiada (Admin SDK) que valide o e-mail no IdToken antes de gravar.

---

## ❌ Pilar 3 — Blindagem de Infraestrutura (SecOps)

### Erro 3.1 — `apiKey` do Firebase hardcoded em `frontend/src/lib/firebase.js`

A constante `FIREBASE_PUBLIC_FALLBACK` contém o valor literal da `apiKey` (`AIzaSyDU5MEsXFf_z6Xvq5pPtQU1fg-28FsUvVk`) e dos demais campos do projeto. Mesmo sendo "pública", o Pilar 3 exige **referência exclusiva a `import.meta.env`** — o fallback hardcoded permite que o bundle continue válido sem `.env`, o que é exatamente o vetor que o Comandante quer eliminar.

**Trecho atual (violação):**

```26:43:frontend/src/lib/firebase.js
const FIREBASE_PUBLIC_FALLBACK = {
  apiKey: "AIzaSyDU5MEsXFf_z6Xvq5pPtQU1fg-28FsUvVk",
  authDomain: "transparenciabr.firebaseapp.com",
  projectId: "transparenciabr",
  storageBucket: "transparenciabr.firebasestorage.app",
  messagingSenderId: "89728155070",
  appId: "1:89728155070:web:5dcae5e5dd6016e63f0def",
};

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || FIREBASE_PUBLIC_FALLBACK.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || FIREBASE_PUBLIC_FALLBACK.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || FIREBASE_PUBLIC_FALLBACK.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || FIREBASE_PUBLIC_FALLBACK.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || FIREBASE_PUBLIC_FALLBACK.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || FIREBASE_PUBLIC_FALLBACK.appId,
};
```

**Correção exata (substituir em `frontend/src/lib/firebase.js`):**

```javascript
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function buildConfig() {
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error(
      "[SecOps] VITE_FIREBASE_* ausente. Defina as chaves em Cursor Dashboard → Secrets ou no .env do frontend.",
    );
    return null;
  }
  return firebaseConfig;
}
```

> O `console.log("Config do Firebase carregada:", !!firebaseConfig.apiKey)` deve ser removido para não vazar boolean de presença de chave em produção.

---

## ✅ Pilar 4 — Estabilidade de UI/UX e Dados Forenses

Auditoria executada com `rg`:

- `w-screen` — **0 ocorrências** no código fonte do `frontend/src/**`. ✅
- Margens negativas (`-mx-`, `-ml-`, `-mr-`) — **0 ocorrências** críticas em layout principal. ✅
- `DashboardLayout.jsx` `<main>` usa `min-w-0 flex-1 overflow-x-hidden overflow-y-auto`. ✅
- Aba CEAP — `frontend/src/utils/dataParsers.js::scalarToDisplay` blindando contra `[object Object]`. ✅
- `frontend/src/components/dossie/CeapMonitorSection.jsx` linhas 190–200 renderiza `urlDocumento` como `<a target="_blank">` com label "Ver nota oficial (Câmara)" — link ativo. ✅
- `functions/index.js::buildCeapQuery` injeta `url_documento` calculado a partir de `numero_documento` (PDF público da Câmara). ✅

Pilar 4 em conformidade.

---

## Resumo Executivo

| Pilar | Status |
|-------|--------|
| 1. Inteligência (`agent_1777236402725` / `gemini-2.5-pro`) | ❌ Bloqueado — `diarioScanner.js` |
| 2. Cofre (GOD `manusalt13@gmail.com` + 300 créditos diários) | ❌ Bloqueado — `firebase.js::ensureUsuarioDoc` |
| 3. SecOps (`import.meta.env` exclusivo) | ❌ Bloqueado — `FIREBASE_PUBLIC_FALLBACK` |
| 4. UI/UX & dados CEAP | ✅ Aprovado |

**Ordem de aplicação sugerida ao Cursor:** 3 → 2 → 1 (do mais crítico para SecOps até o de IA), abrindo um único PR `fix(goat): alinhamento aos 4 pilares` com commits separados por pilar.
