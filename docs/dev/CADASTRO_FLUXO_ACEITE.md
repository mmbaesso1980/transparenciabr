# Fluxo de Cadastro com Aceite — Diretiva Técnica

## Objetivo
Blindagem jurídica via aceite obrigatório de Termos, Privacidade e Ciência sobre IA no cadastro. Persistência em **Data Lake GCS** (diretiva permanente: ZERO dados de auditoria no Firestore).

## Tela de Cadastro
Campos: nome, email, senha, confirmar senha.
Checkboxes obrigatórios (3):
- [ ] Li e aceito os Termos de Uso
- [ ] Li e aceito a Política de Privacidade e LGPD
- [ ] Declaro ciência: IA pode errar, conteúdo é descritivo, devo consultar fontes, classificações são técnicas

Botão "Criar conta" desabilitado até os 3 checks.

## Persistência — Data Lake GCS

Aceites são gravados como **objetos JSON imutáveis** em:

```
gs://datalake-tbr-clean/consents/{uid}/{ISO8601}.json
```

Schema:

```json
{
  "userId": "uid_abc123",
  "timestamp": "2026-05-01T23:30:00.000Z",
  "ipHash": "sha256(userIP+IP_SALT)",
  "userAgent": "Mozilla/5.0 ...",
  "termsVersion": "v1.0",
  "privacyVersion": "v1.0",
  "aiAwarenessVersion": "v1.0",
  "acceptedAll": true,
  "signupSource": "web"
}
```

## Imutabilidade — GCS Retention Policy

```bash
gsutil retention set 5y gs://datalake-tbr-clean
gsutil retention lock gs://datalake-tbr-clean   # opcional, irreversível
```

Retention de 5 anos garante que aceites não podem ser modificados/deletados nem por administradores durante esse período.

## Cloud Function `registerUserConsent` (us-central1)

```javascript
const { Storage } = require("@google-cloud/storage");
const crypto = require("crypto");
const storage = new Storage();
const bucket = storage.bucket("datalake-tbr-clean");

exports.registerUserConsent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Login required");
  }
  const uid = context.auth.uid;
  const ts = new Date().toISOString();
  const ipHash = crypto
    .createHash("sha256")
    .update(context.rawRequest.ip + process.env.IP_SALT)
    .digest("hex");

  const doc = {
    userId: uid,
    timestamp: ts,
    ipHash,
    userAgent: data.userAgent || "",
    termsVersion: process.env.CURRENT_TERMS_VERSION || "v1.0",
    privacyVersion: process.env.CURRENT_PRIVACY_VERSION || "v1.0",
    aiAwarenessVersion: process.env.CURRENT_AI_VERSION || "v1.0",
    acceptedAll: true,
    signupSource: data.source || "web",
  };

  const file = bucket.file(`consents/${uid}/${ts}.json`);
  await file.save(JSON.stringify(doc), {
    metadata: { contentType: "application/json", cacheControl: "no-cache" },
    resumable: false,
  });

  // Firestore APENAS marca status (não armazena o aceite)
  await admin.firestore().doc(`users/${uid}/meta/status`).set({
    hasActiveConsent: true,
    lastConsentAt: admin.firestore.FieldValue.serverTimestamp(),
    consentVersion: doc.termsVersion,
  }, { merge: true });

  return { ok: true, path: `gs://datalake-tbr-clean/consents/${uid}/${ts}.json` };
});
```

## Middleware `requireConsent`

```javascript
async function requireConsent(uid) {
  const [files] = await storage
    .bucket("datalake-tbr-clean")
    .getFiles({ prefix: `consents/${uid}/`, maxResults: 100 });

  if (files.length === 0) return { authorized: false, redirect: "/aceite" };

  const latest = files.sort((a, b) => b.name.localeCompare(a.name))[0];
  const [data] = await latest.download();
  const consent = JSON.parse(data.toString());

  if (consent.termsVersion !== process.env.CURRENT_TERMS_VERSION) {
    return { authorized: false, redirect: "/reaceite" };
  }
  return { authorized: true, consent };
}
```

## Reaceite
Mudança de `CURRENT_TERMS_VERSION` redireciona usuários para `/reaceite` no próximo login. Aceite anterior permanece imutável; novo aceite cria novo objeto GCS.

## Componente React `CadastroForm.jsx`
3 booleanos no estado, botão `disabled={!allThreeChecked}`, links abrem modal com texto completo, submit chama Cloud Function `registerUserConsent`.

## Footer Enxuto
TransparênciaBR © 2026 · Dados públicos · IA pode conter erros
[Metodologia](/metodologia) · [Termos](/termos) · [Privacidade](/privacidade) · [Contraditório](/contraditorio) · [Contato](mailto:contato@transparenciabr.com.br)
