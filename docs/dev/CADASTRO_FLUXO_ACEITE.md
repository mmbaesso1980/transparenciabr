# Fluxo de Cadastro com Aceite — Diretiva Técnica

## Objetivo
Blindagem jurídica via aceite obrigatório de Termos, Privacidade e Ciência sobre IA no cadastro.

## Tela de Cadastro
Campos: nome, email, senha, confirmar senha.
Checkboxes obrigatórios (3):
- [ ] Li e aceito os Termos de Uso
- [ ] Li e aceito a Política de Privacidade e LGPD
- [ ] Declaro ciência: IA pode errar, conteúdo é descritivo, devo consultar fontes, classificações são técnicas

Botão "Criar conta" desabilitado até os 3 checks.

## Firestore — Collection users/{uid}/consents/{timestamp}

```javascript
{
  userId: "uid_abc123",
  timestamp: serverTimestamp(),
  ipHash: sha256(userIP),
  userAgent: navigator.userAgent,
  termsVersion: "v1.0",
  privacyVersion: "v1.0",
  aiAwarenessVersion: "v1.0",
  acceptedAll: true,
  signupSource: "web"
}
```

## Regras Firestore (consents imutáveis)

```javascript
match /users/{uid}/consents/{doc} {
  allow read: if request.auth.uid == uid;
  allow create: if request.auth.uid == uid
    && request.resource.data.acceptedAll == true;
  allow update, delete: if false;
}
```

## Cloud Function onCreate

```javascript
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  await admin.firestore().collection(`users/${user.uid}/meta`).doc("status").set({
    consentRequired: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
});
```

## Middleware requireConsent

```javascript
async function requireConsent(uid) {
  const consents = await db.collection(`users/${uid}/consents`)
    .orderBy("timestamp", "desc").limit(1).get();
  if (consents.empty) return { authorized: false, redirect: "/aceite" };
  const latest = consents.docs.data();
  if (latest.termsVersion !== CURRENT_TERMS_VERSION) {
    return { authorized: false, redirect: "/reaceite" };
  }
  return { authorized: true };
}
```

## Reaceite
Mudança de CURRENT_TERMS_VERSION redireciona todos para /reaceite no próximo login.

## Componente React
CadastroForm.jsx com estado dos 3 booleanos, botão disabled={!allThreeChecked}, links abrem modal com texto completo, submit chama Cloud Function registerUser.

## Footer Enxuto
TransparênciaBR © 2026 · Dados públicos · IA pode conter erros
Metodologia · Termos · Privacidade · Contraditório · Contato
