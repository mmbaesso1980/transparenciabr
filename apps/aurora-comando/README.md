# AURORA Comando

App standalone do pipeline AURORA Forensic. Será publicado em `aurora-comando.pplx.app` e funciona como PWA instalável no mobile do Comandante Baesso.

## Stack

- Vite + React 18 + TypeScript + Tailwind
- Firebase Auth (allowlist em `src/firebase/allowlist.ts`)
- Firebase Firestore (subscription tempo real `dossies_v1/`)
- vite-plugin-pwa + workbox
- FCM (Firebase Cloud Messaging) para push

## Rodar local

```bash
cd apps/aurora-comando
cp .env.example .env.local
# preencher as VITE_FIREBASE_* com valores reais
npm install
npm run dev
```

## Build

```bash
npm run build
# saída em dist/
```

O `prebuild` chama `scripts/gen-icons.mjs` que gera `public/icon-192.png` e `public/icon-512.png` a partir de `public/icon.svg` via sharp. Fallback: PNG mínimo embutido se sharp falhar.

## Deploy pplx.app

Após PR mergeado em main:

```bash
# Computer-side (não local):
pplx-tool publish_website --project_path=apps/aurora-comando
```

Subdomínio sugerido: `aurora-comando`.

## Instalação como PWA

- **iOS Safari**: tocar em "Compartilhar" → "Adicionar à Tela de Início"
- **Android Chrome**: aparece banner automático "Instalar AURORA Comando" ou usar menu "Instalar app"

## Allowlist

`src/firebase/allowlist.ts`:
```ts
export const ALLOWED_EMAILS = ['mmbaesso@hotmail.com']
```

Para adicionar membros da equipe, editar essa lista e re-deployar.

## Páginas

- `/login` — Google sign-in
- `/` — Dashboard (KPIs + dossiês recentes + CTA HQ)
- `/dossies` — lista paginada
- `/dossies/:slug` — detalhe + timeline + ações
- `/revisao` — accordion dos 6 revisores
- `/hq` — link para escritório Phaser em transparenciabr.web.app/escritorio-hq

## Conformidade TransparênciaBR

- Codinome AURORA (sem Asmodeus em UI)
- Tom INFORMATIVO, "Comandante Baesso"
- CPF mascarado `***.XXX.XXX-**`
- Sem palavras proibidas
- `.env.local` ignorado, `.env.example` commitado
