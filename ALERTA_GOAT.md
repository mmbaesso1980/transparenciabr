# ALERTA G.O.A.T. — AUDITORIA CONTÍNUA

> Diretor SecOps/QA — TransparênciaBR
> Auditoria automática do push contra os 4 pilares do Comandante Baesso.
> **Status: NÃO CONFORME — interceptação necessária.**

Resumo executivo das violações detectadas:

| Pilar | Ponto auditado | Veredicto |
|------|----------------|-----------|
| 1. Arquitetura de Inteligência | Modelos Gemini & ID do Líder Supremo | ❌ FALHA |
| 2. Integridade do Cofre (Auth + Modo GOD) | `manusalt13@gmail.com` + 300 créditos diários | ❌ FALHA |
| 3. Blindagem de Infraestrutura | Chaves Firebase hardcoded | ❌ FALHA |
| 4. Estabilidade UI/UX & Dados Forenses | Layout / CEAP / `urlDocumento` | ✅ Conforme (sem regressão crítica neste push) |

---

## 1. Pilar 1 — Arquitetura de Inteligência (REGRA ABSOLUTA)

### 1.1 Erros encontrados

1. **`functions/src/radar/diarioScanner.js:128`** chama `gemini-1.5-flash`. Esse modelo é **desatualizado** e a chamada **não referencia** `agent_1777236402725`.
2. **`functions/src/flows/oraculoFlow.js:3,47`** usa `gemini20Pro` (Gemini 2.0). Não é o motor 2.5 do Líder Supremo nem cita o agente `agent_1777236402725`.
3. **`functions/src/flows/dossieExecutivoFlow.js:3,36`** idem — `gemini20Pro` em vez de Gemini 2.5 / Líder Supremo.
4. **`functions/src/genkit.config.js:2,10`** ainda registra `gemini20Pro` como modelo padrão do Genkit.

> Apenas `functions/index.js` está em conformidade — usa `agent_1777236402725` + `gemini-2.5-pro`.

### 1.2 Correções obrigatórias (aplicar exatamente)

#### `functions/src/radar/diarioScanner.js` (substituir bloco do `getGenerativeModel`)

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
      `Você é o Líder Supremo A.S.M.O.D.E.U.S. (Agent ID ${ASMODEUS_SUPREME_AGENT_ID}). ` +
      "Atue exclusivamente como motor jurídico-forense do TransparênciaBR. Responda apenas JSON válido.",
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  const result = await model.generateContent([
    { text: LEGAL_PROMPT },
    { text: `\n---\nTexto do diário:\n${trecho.slice(0, 48000)}` },
  ]);
  return parseGeminiJson(result.response.text());
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

#### `functions/src/genkit.config.js`

```javascript
const { genkit } = require('genkit');
const { vertexAI, gemini25Pro } = require('@genkit-ai/vertexai');

const ASMODEUS_SUPREME_AGENT_ID = "agent_1777236402725";

const ai = genkit({
  plugins: [vertexAI({ location: 'southamerica-east1' })],
  model: gemini25Pro,
  metadata: {
    liderSupremoAgentId: ASMODEUS_SUPREME_AGENT_ID,
  },
});

module.exports = { ai, ASMODEUS_SUPREME_AGENT_ID };
```

#### `functions/src/flows/oraculoFlow.js` (topo do arquivo)

```javascript
const { z } = require('genkit');
const { ai, ASMODEUS_SUPREME_AGENT_ID } = require('../genkit.config');
const { gemini25Pro } = require('@genkit-ai/vertexai');
```

E na chamada `ai.generate`:

```javascript
const { output } = await ai.generate({
  model: gemini25Pro,
  prompt: `[Líder Supremo ${ASMODEUS_SUPREME_AGENT_ID}]\n${prompt}`,
  output: { schema: AnaliseSchema },
  config: { temperature: 0.2, maxOutputTokens: 8192 },
});
```

#### `functions/src/flows/dossieExecutivoFlow.js`

Mesmas substituições: importar `gemini25Pro` + `ASMODEUS_SUPREME_AGENT_ID`, prefixar `prompt` com `[Líder Supremo agent_1777236402725]` e usar `model: gemini25Pro`.

> Qualquer fluxo que chame IA SEM apontar para `agent_1777236402725` + `gemini-2.5-pro` deve ser bloqueado em CI.

---

## 2. Pilar 2 — Integridade do Cofre (Auth & Modo GOD)

### 2.1 Erros encontrados

1. **`frontend/src/hooks/useUserClaims.js`** trata o `manusalt13@gmail.com` como **regressão**. Hoje **não há** lógica de proteção com `creditos: 9999`, `creditos_ilimitados: true`, `isAdmin: true`, `role: "admin"`. A diretriz G.O.A.T. exige isso.
2. **`frontend/src/lib/firebase.js:89-91`** define `DEFAULT_INITIAL_CREDITS = 320`, sem reset diário. Diretriz G.O.A.T.: **300 créditos diários NÃO-cumulativos** para os demais usuários.
3. **`firestore.rules:53,60`** restringe o `usuarios/{uid}` a `keys().hasOnly(['creditos','updated_at'])`. As chaves obrigatórias do Modo GOD (`creditos_ilimitados`, `isAdmin`, `role`) hoje **seriam rejeitadas** pelas rules. As regras precisam abrir exceção para o e-mail privilegiado e bloquear escalada para os demais.

### 2.2 Correções obrigatórias

#### `frontend/src/lib/firebase.js` — substituir `ensureUsuarioDoc` e default

```javascript
const GOD_OPERATOR_EMAIL = "manusalt13@gmail.com";
const DAILY_USER_CREDITS = 300;

function todayUtcStamp() {
  return new Date().toISOString().slice(0, 10);
}

export async function ensureUsuarioDoc(uid) {
  const firestore = getFirestoreDb();
  const auth = getFirebaseAuth();
  if (!firestore || !uid) return;
  const ref = doc(firestore, "usuarios", uid);
  const snap = await getDoc(ref);

  const email = (auth?.currentUser?.email || "").trim().toLowerCase();
  const isGodOperator = email === GOD_OPERATOR_EMAIL;

  if (isGodOperator) {
    await setDoc(
      ref,
      {
        email,
        creditos: 9999,
        creditos_ilimitados: true,
        isAdmin: true,
        role: "admin",
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
    return;
  }

  const today = todayUtcStamp();
  const prev = snap.exists() ? snap.data() : null;
  const prevDay = prev?.creditos_dia;

  if (!snap.exists() || prevDay !== today) {
    await setDoc(
      ref,
      {
        email,
        creditos: DAILY_USER_CREDITS,
        creditos_ilimitados: false,
        isAdmin: false,
        role: "user",
        creditos_dia: today,
        updated_at: serverTimestamp(),
      },
      { merge: true },
    );
  }
}
```

> Esta lógica **não substitui** `grantRole` por custom claims — ela **complementa**, garantindo que o documento `usuarios/{uid}` do operador GOD esteja sempre selado em conformidade.

#### `firestore.rules` — abrir exceção controlada

```
function isGodOperator() {
  return request.auth != null
    && request.auth.token.email == 'manusalt13@gmail.com';
}

match /usuarios/{userId} {
  allow read: if request.auth != null && request.auth.uid == userId;

  allow create: if request.auth != null
    && request.auth.uid == userId
    && (
      (
        isGodOperator()
        && request.resource.data.creditos == 9999
        && request.resource.data.creditos_ilimitados == true
        && request.resource.data.isAdmin == true
        && request.resource.data.role == 'admin'
      )
      || (
        !isGodOperator()
        && request.resource.data.creditos == 300
        && request.resource.data.creditos_ilimitados == false
        && (request.resource.data.isAdmin == false || !('isAdmin' in request.resource.data))
        && (request.resource.data.role == 'user' || !('role' in request.resource.data))
      )
    );

  allow update: if request.auth != null
    && request.auth.uid == userId
    && (
      isGodOperator()
      || (
        request.resource.data.keys().hasOnly(
          ['creditos', 'creditos_ilimitados', 'isAdmin', 'role', 'creditos_dia', 'email', 'updated_at']
        )
        && request.resource.data.creditos <= 300
        && request.resource.data.creditos_ilimitados == false
        && request.resource.data.isAdmin == false
        && request.resource.data.role == 'user'
      )
    );

  allow delete: if false;
}
```

#### `frontend/src/hooks/useUserClaims.js`

Remover o aviso anti-`manusalt13` e tornar o e-mail PRIVILEGIADO:

```javascript
const GOD_OPERATOR_EMAIL = "manusalt13@gmail.com";

const isGod = (
  tier === "god_mode"
  || isFrontendGodModeBypass(user)
  || (user?.email || "").trim().toLowerCase() === GOD_OPERATOR_EMAIL
);
const isPremium = tier === "premium" || isGod;
const isAdmin = claims.admin === true || isGod;
```

---

## 3. Pilar 3 — Blindagem de Infraestrutura

### 3.1 Erros encontrados

**`frontend/src/lib/firebase.js:26-43`** carrega o objeto `FIREBASE_PUBLIC_FALLBACK` com **valores hardcoded** (`apiKey: "AIzaSyDU5MEsXFf_z6Xvq5pPtQU1fg-28FsUvVk"`, `projectId`, `appId`, etc.). A diretriz G.O.A.T. é zero tolerância: **TUDO deve vir de `import.meta.env`**.

### 3.2 Correção obrigatória — `frontend/src/lib/firebase.js`

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
  for (const [k, v] of Object.entries(firebaseConfig)) {
    if (!v) {
      console.error(`[SECOPS] VITE_FIREBASE_* ausente: ${k}`);
      return null;
    }
  }
  return firebaseConfig;
}
```

> Eliminar **integralmente** `FIREBASE_PUBLIC_FALLBACK`. O deploy só pode ocorrer com `VITE_FIREBASE_*` populados via secret manager (Cloud Build / GitHub Actions / Vercel env). Idem para qualquer chave Stripe/Vertex/GCP — auditar antes de qualquer push subsequente.

---

## 4. Pilar 4 — Estabilidade UI/UX & Dados Forenses

### 4.1 Estado atual

- Não foi encontrada nenhuma utilização de `w-screen` no diretório `frontend/src`.
- Não foram encontradas margens negativas (`-m*-`) que cortem o layout.
- O `DashboardLayout.jsx` aplica `overflow-x-hidden` na `<main>`, e os componentes do dossiê usam `max-w-5xl` / `w-full` corretamente.
- A aba CEAP (`CeapMonitorSection.jsx` + `dataParsers.js > scalarToDisplay/normalizeInvestigationRow/normalizeCeapHistoricoRow`) já neutraliza objetos crus (`[object Object]`) e mapeia `urlDocumento` para link ativo da Câmara.

### 4.2 Veredicto

✅ **Conforme.** Manter vigilância. Qualquer regressão futura (uso de `w-screen`, render de objeto cru, perda do link `urlDocumento`) precisa reabrir esse alerta.

---

## AÇÃO IMEDIATA EXIGIDA

1. Aplicar os patches dos pilares 1, 2 e 3 antes de qualquer novo deploy de `main`.
2. Rotacionar a `apiKey` Firebase exposta no fallback hardcoded (`AIzaSyDU5MEsXFf_z6Xvq5pPtQU1fg-28FsUvVk`) — considerar comprometida.
3. Migrar todos os secrets para `VITE_FIREBASE_*`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `RADAR_OWNER_UID`, `ADMIN_BOOTSTRAP_UID` em secret manager.
4. Cobrir `agent_1777236402725` + `gemini-2.5-pro` por teste de smoke em CI: qualquer chamada IA fora desse alvo derruba o pipeline.
5. Reauditar `ensureUsuarioDoc` e `firestore.rules` para garantir o contrato GOD vs. 300 créditos diários não-cumulativos.

— Diretor SecOps/QA G.O.A.T.
