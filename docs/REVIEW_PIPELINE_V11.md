# Pipeline de Revisão Automatizada — AURORA Forensic v1.1

## Visão Geral

Entre a síntese do Maestro e a geração do PDF, o dossiê passa por uma
**fase de revisão automatizada** com 6 agentes especializados que validam
cada finding contra as regras de integridade v1.0 + v1.1.

```
Maestro síntese
      │
      ▼
┌─────────────────────────────────────────────────┐
│  Fase de Revisão (review_phase.py)              │
│                                                  │
│  ┌──────────┐ ┌──────┐ ┌─────────────┐          │
│  │ Fonte    │ │ Tom  │ │ Contradit.  │  paralelo │
│  │ Primária │ │      │ │             │  asyncio  │
│  └──────────┘ └──────┘ └─────────────┘          │
│  ┌──────────┐ ┌──────┐ ┌─────────────┐          │
│  │ Falso    │ │ PII  │ │ Severidade  │          │
│  │ Positivo │ │      │ │             │          │
│  └──────────┘ └──────┘ └─────────────┘          │
│                                                  │
│  2 retries por agente  │  flag review_warnings   │
└─────────────────────────────────────────────────┘
      │
      ▼
Geração PDF (findings.json já corrigido)
```

Se após 2 retries um agente ainda reportar warnings, o dossiê é publicado
com a flag `review_warnings` registrada no Firestore e no `findings.json`.

---

## Os 6 Agentes Revisores

### 1. `revisor_fonte_primaria` — Lupa

**Função:** Garante que cada finding referencia ao menos uma URL pública verificável.

**Regras:**
- `fontes[]` deve conter ≥ 1 URL `http://` ou `https://` não interna
- Campos `titulo`, `fato`, `analise`, `contraditorio` NÃO devem mencionar:
  `BigQuery`, `bigquery`, `vw_`, `fato_emenda_pagamento`

**Correção automática:** Substitui referências internas por nomes públicos via mapeamento:

| Referência interna | Nome público |
|---|---|
| `vw_score_risco_completo` | Score AURORA · TransparênciaBR |
| `vw_emenda_parlamentar` | Portal da Transparência — Emendas Parlamentares |
| `vw_ceap_consolidado` | Portal da Transparência — CEAP |

**Código de warning:** `[F-FONTE-001]` (sem URL), `[F-FONTE-002]` (referência interna)

---

### 2. `revisor_tom` — Livro

**Função:** Verifica blocklist de verbos e adjetivos acusatórios diretos (v1.0).

**Blocklist:**

| Termo proibido | Substituição sugerida |
|---|---|
| fraudou | registra padrão estatisticamente anômalo compatível com fraude |
| desviou | apresenta movimentação financeira com desvio estatístico significativo |
| roubou | é apontado em ocorrência investigativa de subtração patrimonial |
| corrupto | possui indicadores de risco de integridade elevados |
| ladrão/ladrao | figura em investigação por enriquecimento ilícito suspeito |
| criminoso | é objeto de apuração em processo investigativo |
| prova de crime | indício documentado objeto de apuração |

**Correção automática:** Aplica substituição via regex nos campos `titulo`, `fato`, `analise`, `contraditorio`.

**Código de warning:** `[F-TOM-001]`

---

### 3. `revisor_contraditorio` — Balança

**Função:** Verifica template de 3 partes em findings de severidade ≥ MÉDIA.

**Findings afetados:** `CRÍTICA`, `ALTA`, `MÉDIA`

**Template obrigatório:**

```
Parte 1 — Decisão judicial:
  "Não foi localizada decisão judicial definitiva..." (ou citação do acórdão)

Parte 2 — Manifestação pública:
  "Não foi localizada manifestação pública..." (ou citação da nota)

Parte 3 — Direito de resposta:
  "O parlamentar tem assegurado o direito de resposta e manifestação
  institucional sobre os apontamentos deste dossiê..."
```

**Correção automática:** Acrescenta as partes ausentes ao campo `contraditorio`.

**Código de warning:** `[F-CONTRA-001]`

---

### 4. `revisor_falso_positivo` — Scholar

**Função:** Aplica as regras Gemini v1.1 para reclassificação de prováveis falsos positivos.

**REGRA-FP-BANCADA:**
- Se o fornecedor (CNPJ) é compartilhado por ≥ 3 deputados da bancada
- → Reclassifica para `INFORMATIVO`
- → Adiciona nota "Reclassificação pós-investigação"
- Campo interno de injeção: `_fp_bancada_count`

**CONTRATO_RECORRENTE:**
- Se mesmo CNPJ + valor similar por ≥ 3 meses consecutivos
- → Reduz severidade 1 nível (`CRÍTICA`/`ALTA` → `MÉDIA`)
- → Adiciona nota "Reclassificação pós-investigação"
- Campo interno de injeção: `_recorrente_meses`

**Código de warning:** `[F-FP-001]` (bancada), `[F-FP-002]` (recorrente)

---

### 5. `revisor_mascara_pii` — Cadeado

**Função:** Conformidade LGPD — mascara CPFs e detecta dados Classe C.

**CPF mascarado:**
- Regex: `\d{3}\.\d{3}\.\d{3}-\d{2}`
- Formato saída: `***.XXX.XXX-**` (dígitos centrais 4–9 preservados)
- **Correção automática**

**Dados Classe C (warning manual):**
- Renda estimada/mensal/anual
- Nome da mãe
- Endereço residencial / domicílio
- Telefone particular / celular pessoal

**⚠️ Dados Classe C NÃO são substituídos automaticamente** — exige revisão
humana pelo Comandante antes da publicação.

**Código de warning:** `[F-PII-001]` (CPF mascarado), `[F-PII-002]` (Classe C detectada)

---

### 6. `revisor_severidade` — Semáforo

**Função:** Aplica cap de severidade quando o contraditório evidencia prerrogativa legal.

**Condições de cap em MÉDIA:**
- Contraditório contém "decisão judicial favorável", "absolvido", "arquivado",
  "habeas corpus deferido", etc.
- Contraditório contém "prerrogativa legal", "decisão administrativa válida",
  "ato administrativo regular", "autorizado por lei", etc.

**Distribuição saudável esperada (warning se fora do intervalo):**

| Severidade | Mínimo | Máximo |
|---|---|---|
| CRÍTICA | 10 | 15 |
| ALTA | 15 | 20 |
| MÉDIA | 12 | 16 |
| INFORMATIVO | 8 | 12 |

**Código de warning:** `[F-SEV-001]` (cap aplicado), `[F-SEV-002]` (distribuição)

---

## Schema Firestore

```
dossies_v1/{slug}/
  - status: "reviewing" | "done"
  - phase: "review"
  - review_log: { ... }          ← log completo da última execução
  - updated_at: ISO 8601

dossies_v1/{slug}/review/{revisor_id}/
  - revisor_id: string
  - state: "idle" | "reviewing" | "approved" | "warnings" | "rejected"
  - warnings: string[]
  - retries: 0 | 1 | 2
  - finished_at: ISO 8601
```

---

## Como Interpretar Warnings

Cada warning tem o formato:
```
[CÓDIGO] Finding 'F-XX' campo 'campo': descrição do problema.
```

| Prefixo | Agente | Ação |
|---|---|---|
| `F-FONTE-*` | Fonte Primária | Verificar URL ou remover referência interna |
| `F-TOM-*` | Tom | Correção automática aplicada |
| `F-CONTRA-*` | Contraditório | Template completado automaticamente |
| `F-FP-*` | Falso Positivo | Reclassificação automática aplicada |
| `F-PII-001` | PII | CPF mascarado automaticamente |
| `F-PII-002` | PII | **Requer revisão humana** (Classe C) |
| `F-SEV-*` | Severidade | Cap automático ou aviso de distribuição |

---

## Log de Revisão

O arquivo `review_log.json` é persistido em:
- `/tmp/dossies_v1/{slug}/review_log.json` (local)
- `dossies_v1/{slug}/review_log` (Firestore, campo no documento raiz)

Estrutura:
```json
{
  "slug": "nome-slug",
  "started_at": "2025-01-01T00:00:00Z",
  "finished_at": "2025-01-01T00:00:30Z",
  "status": "approved | warnings",
  "total_warnings": 3,
  "total_retries": 1,
  "corrections_applied": true,
  "warnings": ["..."],
  "revisor_results": {
    "revisor_tom": {
      "status": "approved",
      "warnings": [],
      "retries": 0
    }
  }
}
```

---

## Re-executar Revisão

### Via UI (RevisaoPage)
1. Acesse `/revisao` no painel (rota protegida)
2. Localize o dossiê desejado
3. Clique em **"Re-rodar revisão"**
4. O callable `rerunReview` publica mensagem Pub/Sub com `review_only: true`

### Via Firebase CLI
```bash
firebase functions:call rerunReview --data '{"slug":"nome-slug"}'
```

---

## SLA

Com 50 findings típicos:
- **~30 segundos** por dossiê (6 revisores em paralelo + asyncio)
- Cada retry adiciona ~5 segundos por agente
- Firestore: atualizações incrementais a cada passo

---

## Arquivos

```
manus_office/dossie_v1/agents/revisores/
├── __init__.py                  ← run_all_reviewers() + REVISORES registry
├── revisor_fonte_primaria.py
├── revisor_tom.py
├── revisor_contraditorio.py
├── revisor_falso_positivo.py
├── revisor_mascara_pii.py
├── revisor_severidade.py
└── tests/
    └── test_revisores.py

manus_office/dossie_v1/pipeline/
├── __init__.py
└── review_phase.py              ← orquestrador com Firestore + retries

frontend/src/
├── pages/RevisaoPage.jsx
└── components/revisao/RevisorCard.jsx

functions/src/dossie/
└── rerunReview.js
```
