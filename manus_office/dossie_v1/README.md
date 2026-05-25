# Dossiê Forense Parlamentar v1.0 — Pipeline Legião 100

Skill `dossie-forense-parlamentar` (v1.0 release stable) integrada à Legião 100
do Meu Manus, orquestrada via Cloud Run Job + Firestore live status.

## Fluxo end-to-end

1. Usuário autenticado acessa `https://transparenciabr.web.app/escritorio`.
2. Digita nome do parlamentar (ex.: "Kim Kataguiri") e clica em
   **"Ativar Legião 100"**.
3. Frontend chama Cloud Function callable `iniciarDossieV1`:
   - Valida `request.auth.uid`.
   - Gera slug (NFD + lower + hífens).
   - Cria documento Firestore `dossies_v1/{slug}` com
     `status: "queued"` e `agents: {}`.
   - Publica JSON `{ slug, nome, requester_uid }` em Pub/Sub
     `dossie-v1-pipeline`.
4. Eventarc dispara o Cloud Run Job `dossie-v1-pipeline`
   (`cloudrun/dossieV1Pipeline/`).
5. Job carrega:
   - `prompts/lei_transparenciabr.md` (189 linhas — lei do projeto).
   - `prompts/skill_dossie_v1_0.md` (475 linhas — skill v1.0).
   - `examples/findings_erika_gold.json` + `findings_kim_gold.json` (few-shot).
6. Job executa `manus_office/dossie_v1/dossie_pipeline.py` em modo
   `--firestore-doc dossies_v1/<slug>`:
   - Roda 10 agentes da `crew-dossie-forense-v1` em paralelo via
     `asyncio.gather`. Cada agente:
     - Tem prompt longo injetando contexto da skill v1.0 (princípios 9/10/11,
       tom INFORMATIVO, verbos descritivos, contraditório 3-partes).
     - Usa Gemini 2.5 Pro + DuckDuckGo OSINT.
     - Devolve lista de findings v1.0 (id, titulo, classificacao, severidade,
       fato, analise, contraditorio, fontes).
     - Atualiza `dossies_v1/{slug}.agents.<id>` em tempo real
       (`status: running → done|error`).
   - Addon `news_realtime` (11º, não conta nos 100) coleta notícias via Google
     News RSS + GDELT 2.0 + dorks Folha/UOL/G1/CNN, triadas por Gemini Flash.
   - Maestro Supremo consolida tudo, valida tom (regex blocklist:
     `fraudou|desviou|roubou|corrupto|bigquery|vw_`), garante 40-55 findings,
     distribui severidade (CRÍTICA/ALTA/MÉDIA/INFORMATIVO).
7. Job chama `scripts/gerar_dossie_v1.py` (ReportLab) → PDF
   `Dossie_<Alvo>_v1-0.pdf` em `/tmp/dossies_v1/<slug>/`.
8. Job faz upload para `gs://datalake-tbr-clean/dossies_v1/<slug>.pdf` e
   atualiza Firestore com `pdf_url` + `status="done"`.
9. Frontend (`useDossieV1Status` via `onSnapshot`) mostra avatares vivos
   durante execução e link de download ao final.

## Arquitetura (ASCII)

```
   Usuário cívico (jornalista, pesquisador, eleitor)
        │
        │ 1. clica "Ativar Legião 100" em /escritorio
        ▼
   ┌──────────────────────────────────┐
   │  Frontend React (Firebase Hosting)│
   │   src/pages/EscritorioPage.jsx   │
   │   src/hooks/useDossieV1Status.js │
   └────────────┬─────────────────────┘
                │ httpsCallable("iniciarDossieV1")
                ▼
   ┌──────────────────────────────────┐
   │  Cloud Function (southamerica-east1)
   │  functions/src/dossie/           │
   │     iniciarDossieV1.js           │
   └────────────┬─────────────────────┘
                │ set + publishMessage
                ▼
   ┌─────────────────────┐    ┌─────────────────────────┐
   │  Firestore          │    │  Pub/Sub topic          │
   │  dossies_v1/{slug}  │◀───│  dossie-v1-pipeline     │
   └─────────────────────┘    └─────────────┬───────────┘
            ▲                               │ Eventarc trigger
            │ agents.<id>.status            ▼
            │                  ┌──────────────────────────────┐
            │                  │  Cloud Run Job (BR)          │
            │                  │  dossie-v1-pipeline          │
            │                  │  cloudrun/dossieV1Pipeline/  │
            │                  └─────────────┬────────────────┘
            │                                │
            │                                ▼
            │              ┌────────────────────────────────────┐
            │              │ dossie_pipeline.py  (asyncio)      │
            │              │  • 10 agentes paralelos (Gemini Pro)│
            │              │  • addon news_realtime (Flash)      │
            │              │  • Maestro consolida + valida tom   │
            └──────────────│  • gerar_dossie_v1.py → PDF        │
                           └────────────────┬───────────────────┘
                                            │ upload
                                            ▼
                            gs://datalake-tbr-clean/dossies_v1/<slug>.pdf
                                            │
                                            └──────▶ pdf_url atualizado no Firestore
                                                       │
                                                       ▼
                                              Frontend mostra link de download
```

## 10 agentes da `crew-dossie-forense-v1`

| ID | Função | Fontes |
|---|---|---|
| identificacao | TSE + Câmara API + perfis sociais | TSE DivulgaCandContas, dadosabertos.camara.leg.br |
| ceap_anomalias | CEAP + Benford + Z-score | Portal Câmara CEAP |
| emendas | Emendas autoria/pagamento | Portal Transparência |
| judicial | TRF/STF/PJe consulta processos | STF, TRF1 PJe, TJSP |
| eixo5_empresas | CNPJs exclusivos + cruzamento sócios | BrasilAPI, Direct Data |
| osint | Sherlock + Wayback + dorks | Google, Wayback Machine |
| contraditorio | Manifestações públicas | CNN, Folha, UOL, Instagram |
| falso_positivo | Anti-imputação | Google Scholar, Lattes, LinkedIn |
| fonte_primaria | Normalizador BigQuery → fonte primária | (interno) |
| decisao_judicial | Watcher TRF/STF/PJe decisões novas | TRF1 PJe, STF |

Maestro Supremo consolida, e `news_realtime` é o 11º (addon, não conta nos 100).

## Restrições de tom (regex blocklist)

Os agentes não podem usar verbos imputadores ou citar infra interna:
- ❌ `fraudou`, `desviou`, `roubou`, `corrupto`
- ❌ `BigQuery`, `vw_*`, `transparenciabr.transparenciabr`

Tom obrigatório: INFORMATIVO ("registra", "consta", "observa-se",
"merece monitoramento"). Trato pelo **Comandante Baesso**.

## LGPD

CPF mascarado como `***.XXX.XXX-**` em todos os outputs (findings + PDF).

## Comandos úteis

```bash
# Smoke test local (requer GEMINI_API_KEY)
cd manus_office/dossie_v1
python3 dossie_pipeline.py --alvo "Kim Kataguiri" --slug "kim-kataguiri"

# Gerar PDF a partir de findings JSON
python3 scripts/gerar_dossie_v1.py \
  --findings examples/findings_kim_gold.json \
  --output /tmp/teste_kim_v1.pdf \
  --alvo "Kim Kataguiri" \
  --slug "kim-kataguiri"

# Provisionar Pub/Sub + GCS (uma vez)
bash ../../infrastructure/setup_dossie_v1.sh

# Deploy completo
bash ../../infrastructure/deploy_aurora_forensic_v1.sh

# Inspecionar Firestore live
gcloud firestore documents list dossies_v1 --project=transparenciabr

# Logs do Cloud Run Job
gcloud run jobs executions list --job=dossie-v1-pipeline \
  --region=southamerica-east1 --project=transparenciabr
```

## Variáveis de ambiente

Ver `infrastructure/env_dossie_v1.md`.

## Custo

~R$ 1,50 por dossiê. Ver `CHANGELOG_AURORA_FORENSIC_V1.md`.

## Referência viva

🥇 Dossiê Erika Hilton v3.5.1 (mai/2026) — 54 findings (12 CRÍTICA · 18 ALTA ·
14 MÉDIA · 10 INFORMATIVO), 42 páginas, Eixo 5 ativado, contraditório judicial
3-partes, fontes primárias 100%, F-13 reclassificado de CRÍTICA → INFORMATIVO
(modelo de honestidade editorial).
