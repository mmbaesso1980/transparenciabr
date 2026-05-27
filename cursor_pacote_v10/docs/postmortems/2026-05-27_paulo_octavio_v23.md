# Postmortem · Dossiê Paulo Octávio v2.3
**Data:** 27/mai/2026 · **Severidade:** ALTA (contida internamente) · **Status:** Em correção (M11+M12)

## TL;DR
Auditoria do Comandante Baesso no PDF v2.3 do caso Paulo Octávio identificou
três classes de vazamento que escaparam de todos os 6 revisores ativos:

1. **Bugs estruturais** — campos `None` e `?` literais em ~10 findings (F-46 a F-56, F-78)
2. **PII do solicitante vazada** — F-78 cita "Conta do solicitante: Maurilio Mesquita Baesso"
3. **Codinomes internos expostos** — "motor AURORA 360", "agentes técnicos", "pipeline automatizado"

Sem publicação externa. Risco zero materializado. Risco potencial alto se tivesse circulado.

## Timeline (UTC-3)
| Hora | Evento |
|---|---|
| 26/mai 23:35 | Geração v2.3 pelo eviscerador standalone na VM aurora-cacador-br |
| 27/mai 00:00 | Entrega pelo agente humano-supervisionado no chat |
| 27/mai 00:25 | Comandante envia análise externa identificando as 3 classes |
| 27/mai 00:38 | Contenção confirmada (não publicado) |
| 27/mai 00:42 | Postmortem aberto · M11 + M12 priorizadas |

## 5 Whys

**Por que `None` apareceu no PDF?**
→ O builder de PDF (`gerar_dossie_v23.py`) faz `f"Direct Data registra o processo {p['numero']} no TJDFT"` sem checar se `p['numero']` é `None`.

**Por que o builder não foi testado para esse caso?**
→ Não existe replay-as-test (M09) com casos âncora. O builder roda no caso novo e só dá pra ver problema no produto final.

**Por que o nome do solicitante apareceu em F-78?**
→ O template do finding F-78 ("Conta do solicitante") foi copiado de um relatório interno de auditoria de uso e nunca removido para os outputs externos. **Não existia sanitizador.**

**Por que codinomes "AURORA 360" e "agentes técnicos" vazaram?**
→ A blocklist da lei (`transparenciabr-lei`) lista palavras proibidas, mas o CI ainda não estava ativo (M01 pendente). Os 6 revisores leem em paralelo ao texto mas amostram, não fazem full-scan.

**Por que ninguém pegou em 6 revisores?**
→ Os revisores estão calibrados para tom (linguagem acusatória), fontes, CPF, severidade e contraditório. Não para bugs estruturais nem PII do operador. **Defesa em profundidade era incompleta.**

## Causa raiz
**Pipeline com defesas em paralelo (6 revisores) mas com gaps estruturais não cobertos por nenhuma camada:**
- Nenhuma camada checava sentinelas estruturais (`None`, `?`, `undefined`)
- Nenhuma camada checava identidade do operador no output
- CI lint de tom não estava ativo
- Não havia replay-as-test garantindo regressão zero

## Impacto
- **Externo:** zero (não publicado)
- **Interno:** confiança na automação parcialmente abalada — auditoria humana continua sendo gate obrigatório
- **Reputacional potencial:** se publicado, exposição do Comandante como contratante + descrédito do produto

## Ações corretivas (rastreáveis no roadmap v10.0.0)

| ID | Task | Prazo |
|---|---|---|
| **M11** | Protocolo de Incidente + Retratação + este postmortem | Sprint S1 |
| **M12** | Sanitizador de PII do solicitante (defesa em profundidade) | Sprint S1 |
| **M01** | CI lint de tom em PDFs em PR | Sprint S1 |
| **M09** | Replay-as-test (casos âncora) | Sprint S3 |
| novo | Adicionar `paulo_v23_known_issues.yaml` ao replay-suite | M09 |
| novo | Treinar 7º revisor `revisor_sentinelas_estruturais` | M09 |
| novo | Treinar 8º revisor `revisor_pii_solicitante` | M12 |

## Lições para o maestro_memory

```bash
python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py write \
  incident-pii-solicitante-v23 \
  "PII do solicitante (nome Maurilio Mesquita Baesso) vazou no finding F-78 do dossiê Paulo Octávio v2.3 porque o template copiado de auditoria interna não foi sanitizado. Defesa em profundidade exigia sanitizador independente (M12). Os 6 revisores não checavam identidade do operador." \
  --tags incident pii sanitization template lgpd

python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py write \
  sentinelas-estruturais-pdf \
  "Sempre escanear o output final por strings literais None, undefined, ?, [object Object], NaN. Bug do builder de PDF v2.3 deixou `processo None no TJDFT` em ~10 findings. Adicionar verificação no engines/incident/sentinels.yaml (M11)." \
  --tags incident pdf bugs sentinelas

python /home/user/workspace/aurora_v3_maestro/memory/firestore_memory.py write \
  codinomes-internos-vazam-em-template \
  "Codinomes internos (AURORA 360, agentes técnicos, motor) vazaram no texto narrativo do v2.3. CI lint M01 precisa rodar full-scan, não só amostragem dos 6 revisores." \
  --tags incident tom codinomes blocklist
```

## Auditoria do incidente
Doc Firestore `maestro_incident_log/inc-2026-05-27-paulo-v23` (criar ao implementar M11).

## Owner
Maurilio Mesquita Baesso (Comandante) + Maestro v1.0

## Status
🔄 Em correção — Sprint S1 do roadmap v10.0.0 (encerramento previsto 03/jun/2026)
