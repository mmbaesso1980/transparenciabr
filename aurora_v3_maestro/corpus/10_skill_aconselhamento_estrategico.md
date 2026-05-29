---
name: aconselhamento-estrategico-aurora
version: 1.0
scope: user
---

# Aconselhamento Estratégico AURORA — Skill

## Quando usar

Carregar quando o Comandante Baesso pedir:

- **Análise estratégica de longo prazo** de alvo investigado (ofensivo — antecipar movimentos do alvo)
- **Auto-auditoria da campanha própria** (defensivo — detectar captura incremental, viés de confirmação, escalation creep)
- **Aconselhamento de mídia/narrativa** — como apresentar finding ao público sem violar "Não denunciamos. Mostramos."
- **Leitura de padrões de longuíssimo prazo** em parlamentar (5+ anos de mandato)
- **Estratégia eleitoral** — calendário de exposição, timing de release, contra-narrativa esperada

## NÃO usar para

- Dossiê operacional comum → `dossie-forense-parlamentar`
- Due diligence empresarial → `due-diligence-pro`
- Operação técnica do pipeline → `aurora-forensic-ops`

## Doutrina analítica (20 princípios)

Esta skill aplica 20 princípios extraídos de fontes clássicas como **instrumentos de análise estratégica, jamais de identidade ou misticismo**.

### Origens

1. **Nefarious (2023)** — princípios de manipulação institucional
2. **Cartas de Screwtape (C.S. Lewis)** — auto-engano e racionalização
3. **Saul Alinsky — Rules for Radicals** — táticas de pressão e moldagem narrativa
4. **Antonio Gramsci — Hegemonia cultural** — captura incremental de consenso
5. **Hannah Arendt — Origens do Totalitarismo + Banalidade do Mal** — burocratização da violência
6. **Maquiavel — O Príncipe + Discorsi** — estabilidade vs. virtù
7. **Sun Tzu — A Arte da Guerra** — desbalanceamento e indireção

### Os 20 princípios operacionais

1. **Antecipar 3 movimentos** — para cada ação do alvo, projetar contra-resposta esperada
2. **Captura incremental** — identificar concessões pequenas que abrem porta a grandes
3. **Inversão narrativa** — alvo vai tentar virar vítima; preparar contra
4. **Tempo é arma** — release com timing erra ou acerta sozinho
5. **Banalidade do mal** — a maior parte do desvio é burocrático, não criminoso
6. **Hegemonia silenciosa** — a opinião pública se desloca antes da lei
7. **Virtù e fortuna** — separar mérito de sorte no histórico do alvo
8. **Indireção** — atacar fortaleza pela retaguarda do aliado
9. **Auto-engano** — checar viés de confirmação em CADA finding
10. **Escalation creep** — investigador vira o que combate se não houver freio
11. **Linguagem cria realidade** — escolher cada substantivo do dossiê
12. **Contradiço pré-emptivo** — apresentar contra-argumento antes do alvo
13. **Densidade vs. clareza** — 18 findings densos > 50 frouxos
14. **Forensia administrativa** — anomalia estatística > acusação criminal
15. **Cadeia de custódia** — toda evidência precisa SHA-256 e timestamp
16. **Right of reply** — 48h não é cortesia, é defesa jurídica
17. **Audit trail interno** — quem revisou o quê, quando
18. **Não personificar a luta** — alvo é padrão, não pessoa
19. **Saber recuar** — finding falso positivo = revisão pública imediata
20. **Princípio da última ferida** — sempre deixar saída honrosa ao alvo

## Saída esperada

Quando invocada, esta skill produz um **dossiê estratégico** (separado do dossiê forense):

- **Capítulo 1 — Mapa de Movimentos** (próximas 12 semanas)
- **Capítulo 2 — Vetores de Captura** (riscos internos da campanha)
- **Capítulo 3 — Calendário de Exposição** (timing release/contra-release)
- **Capítulo 4 — Cenários** (otimista/base/pessimista)
- **Capítulo 5 — Auto-Auditoria** (vieses e armadilhas detectadas)

PDF com tom **ESTRATÉGICO** (distinto do INFORMATIVO dos dossiês forenses), uso interno apenas, marca d'água "USO RESTRITO".

## Regra inviolável

**Linguagem simbólica (Nefarius, Screwtape, etc.) PERMITIDA internamente nesta skill.**
**PROIBIDA em UI, dossiês públicos, código, logs.**

Skill é instrumento de **análise estratégica**, jamais de **identidade** ou **misticismo**.

## Skills relacionadas

- `transparenciabr-lei` (autoridade superior)
- `dossie-forense-parlamentar` (dossiê INFORMATIVO público)
- `due-diligence-pro` (dossiê empresarial)
- `aurora-forensic-ops` (operação pipeline)
