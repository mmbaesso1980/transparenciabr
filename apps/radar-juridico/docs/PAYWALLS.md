# PAYWALLS.md — Radar Jurídico INSS

**Versão:** 1.0 scaffold  
**Aprovado por:** Comandante Maurílio Baesso · 2026-05-30 12:03 BRT

---

## Visão geral das 2 paywalls

O Radar Jurídico opera com **2 paywalls independentes**, ambas baseadas no mesmo
sistema de créditos (`usuarios/{uid}.creditos`) já estabelecido no TransparênciaBR.

```
┌───────────────────────────────────────────────────────────────────┐
│  FREEMIUM (sem crédito)                                           │
│  • Listagem simples de indeferimentos (últimos 30 dias)           │
│  • Limite: 50 leads/dia (reset às 00:00 BRT)                     │
│  • Sem filtros avançados, sem match ICP                           │
│  • CTA: "Desbloqueie análise completa — 1 crédito"               │
└───────────────────────────────────────────────────────────────────┘
          ▼ 1 crédito
┌───────────────────────────────────────────────────────────────────┐
│  PAYWALL 1 — Análise de lead                                      │
│  Custo: 1 crédito por lead detalhado                              │
│  • Match ICP completo (score 0-100)                               │
│  • Filtros avançados (UF, espécie, motivo, faixa score)           │
│  • Tese recomendada pelo motor Aurora                             │
│  • CPF mascarado (***.***.xxx-**) — sem enriquecimento PII        │
│  • Export CSV (até 100 leads, com header LGPD)                    │
└───────────────────────────────────────────────────────────────────┘
          ▼ 2 créditos
┌───────────────────────────────────────────────────────────────────┐
│  PAYWALL 2 — Alerta "publicou-pegamos"                            │
│  Custo: 2 créditos por alerta configurado                         │
│  • Monitor de publicações DOU / PJe por número de processo        │
│  • Verificação anti-waste PJe TRF3 (litispendência)               │
│  • Notificação FCM + Telegram em até 30 minutos após publicação   │
│  • Histórico de disparos (últimos 90 dias)                        │
│  • Máximo de alertas ativos: 20 por usuário                       │
└───────────────────────────────────────────────────────────────────┘
```

---

## Tabela de preços de créditos

| Ação | Créditos |
|---|---|
| Freemium diário (auto-reset) | 300 créditos |
| Análise de lead (Paywall 1) | 1 crédito |
| Alerta ativo — cadastro (Paywall 2) | 2 créditos |
| Alerta ativo — disparo com enriquecimento AURORA | +1 crédito |
| Export CSV (100 leads) | 5 créditos |

> Os preços de créditos são configurados via `src/data/creditPricing.js`
> no frontend e validados **server-side** no backend. O frontend nunca
> debita créditos diretamente no Firestore — isso é feito pelo backend
> via Admin SDK, seguindo o padrão de `functions/src/leads/utils/firestoreCredits.js`.

---

## Fluxo de cobrança de créditos

### Diagrama de sequência (Paywall 1)

```
Frontend              Backend (Cloud Run)         Firestore
   │                         │                        │
   │── POST /leads ──────────►│                        │
   │   { filtros, page }     │                        │
   │                         │── GET usuarios/{uid} ──►│
   │                         │◄── { creditos: N } ────│
   │                         │                        │
   │                         │ [N >= 1?]              │
   │                         │ não → 402 Payment Req. │
   │◄── 402 insuficiente ────│                        │
   │   show PaywallGate      │                        │
   │                         │                        │
   │                         │ [N >= 1]               │
   │                         │── UPDATE creditos=N-1 ─►│
   │                         │   (Admin SDK)          │
   │                         │── SELECT leads BQ ─────►│(BQ)
   │                         │◄── leads[] JSON ───────│
   │◄── 200 leads[] ─────────│                        │
```

### Regras Firestore anti-escalonamento

O débito de créditos do Radar Jurídico **nunca é feito pelo SDK web**
diretamente no Firestore. Assim como o resto do TransparênciaBR:

- Frontend chama o backend (Cloud Run) com o Bearer token do usuário
- Backend verifica o saldo via Admin SDK
- Backend debita via Admin SDK (campo `creditos` e `updated_at`)
- Backend grava log em `radar_juridico_creditos_log` (auditoria)
- Backend retorna os dados ao frontend

As regras Firestore em `firestore_radar_juridico.rules` **impedem** que
o cliente web escreva em coleções de créditos — apenas leitura do próprio saldo.

---

## PJe anti-waste check (componente do Paywall 2)

O Paywall 2 inclui **verificação automática de litispendência** via PJe TRF3
antes de disparar qualquer alerta, para evitar que o advogado receba notificação
de um processo onde já há ação ativa — o chamado "anti-waste check".

```
Alerta configurado
       │
       ▼
pje_checker.py (backend)
       │
       ├── [token PJe disponível?]
       │     ├── sim → consulta TRF3 por número_processo ou CPF
       │     │         ├── LIVRE → dispara alerta
       │     │         ├── VERIFICAR → dispara com aviso amarelo
       │     │         └── DESCARTAR → silencia alerta, loga descarte
       │     │
       │     └── não → dispara com aviso "Verificar manualmente TRF3"
       │               (não consome crédito adicional)
```

O token PJe do advogado é armazenado em **Secret Manager** (`PJE_TOKEN_{uid}`)
ou fornecido via variável de ambiente. **Nunca é armazenado no Firestore em claro.**

### Configuração do token PJe

```python
# TODO(maestro): implementar em backend/src/services/pje_checker.py
# O token é recuperado do Secret Manager usando o uid do usuário:
#   secret_name = f"projects/{project}/secrets/PJE_TOKEN_{uid}/versions/latest"
# Fallback: variável de ambiente PJE_TOKEN (para contas únicas)
```

---

## Estados do alerta (máquina de estados)

```
INATIVO ──── usuário configura ────► ATIVO
   ▲                                    │
   │                                    │ 2x/dia (job)
   │                                    ▼
   │                             VERIFICANDO
   │                                    │
   │                    ┌───────────────┴────────────────┐
   │                    │                                │
   │             ENCONTRADO                        NÃO_ENCONTRADO
   │                    │                                │
   │             NOTIFICADO ◄────── disparo FCM/TG       │
   │                    │                                │
   └──── usuário arquiva └────── usuário mantém ─────────┘

DESCARTADO ← litispendência ATIVA detectada
```

---

## UX — componentes de paywall

### PaywallGate.jsx (a implementar)

Inspirado em `frontend/src/components/PremiumGate.jsx` e `dossie/UnlockGate.jsx`,
mas com duas variantes:

```jsx
// Paywall 1 — análise de lead
<PaywallGate
  tier="paywall1"
  custo={1}
  descricao="Ver análise completa deste lead"
  onUnlock={handleAnalise}
/>

// Paywall 2 — configurar alerta
<PaywallGate
  tier="paywall2"
  custo={2}
  descricao="Ativar alerta publicou-pegamos para este processo"
  onUnlock={handleAlerta}
/>
```

O componente deve mostrar:
- Saldo atual de créditos
- Custo da ação
- Saldo após operação
- Botão "Confirmar" (debita e executa) ou "Recarregar créditos" (redireciona para CreditosPage)
- Link para `/creditos` se saldo insuficiente
