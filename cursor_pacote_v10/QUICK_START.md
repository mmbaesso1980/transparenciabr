# QUICK START — Roadmap v10.0.0 TransparênciaBR

**Comandante Baesso** · 23 tasks · 6 sprints · 133 pts · pacote pronto pra Cursor.

## 1. Abrir no Cursor (3 passos)

```bash
unzip cursor_pacote_v10_completo.zip
cd cursor_pacote_v10
chmod +x scripts/EXECUTE_CURSOR.sh
./scripts/EXECUTE_CURSOR.sh                    # menu interativo
```

Ou direto na primeira frente:

```bash
./scripts/EXECUTE_CURSOR.sh sprint S0-EMERG    # abre M11 + M12 + M01 + prompt-mãe
```

## 2. Ordem obrigatória

| Ordem | Sprint | Tasks | Pts | Bloqueante? |
|---|---|---|---|---|
| 1º | **S0-EMERG** | M11, M12, M01 | 15 | ✅ SIM (resposta ao v2.3) |
| 2º | S1 | S03, S05, M02 | 13 | — |
| 3º | S2 | S01, S02, M09 | 18 | — |
| 4º | S3 | S04, S06, S07 | 18 | — |
| 5º | S4 | S08, S09, S11, M04 | 29 | — |
| 6º | S5 | S10, M03, M05, M06 | 16 | — |
| 7º | S6 | M07, M08, M10 | 24 | — |

**Regra:** não sobe sprint sem fechar o anterior. S0-EMERG bloqueia qualquer dossiê novo.

## 3. Workflow Cursor por task

1. Abrir spec da task (ex: `docs/roadmap_v10/M11.md`)
2. Abrir `prompts/CURSOR_PROMPT_MASTER.md` (contexto + leis)
3. Atribuir ao Agent correto: A (backend), B (front), C (infra), D (Maestro)
4. Cursor implementa → roda CI lint de tom (M01) → PR
5. LLM-as-Judge (M02) revisa → merge
6. Atualizar `docs/roadmap_v10/PROGRESS.md` (marcar `[x]`)
7. Maestro confirma via Telegram

## 4. Estrutura do pacote
