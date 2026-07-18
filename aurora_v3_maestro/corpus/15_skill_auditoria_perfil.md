---
name: auditoria-perfil-instagram
description: >-
  Audita um perfil de Instagram (ou outra rede social) e entrega um diagnóstico
  priorizado de crescimento: os erros mais graves, o que manter, bio reescrita,
  arquitetura de destaques e a única correção de maior impacto para a semana.
  Use quando o Comandante Baesso pedir "audita meu perfil", "audita o Instagram
  de X", "diagnóstico de perfil", "conserta meu Instagram" ou similar. Inspirada
  num prompt de auditoria de perfil visto em conteúdo de terceiros no Instagram
  (@gurudoprompt) e adaptada ao tom e às regras do Maestro.
---

# Auditoria de Perfil (Instagram) — Skill

## Quando usar

Carregar quando o Comandante Baesso pedir para auditar, diagnosticar ou
consertar um perfil de rede social (Instagram em primeiro lugar; a estrutura
serve para qualquer rede baseada em bio + destaques + feed).

## NÃO usar para

- Dossiê forense de parlamentar ou empresa → `dossie-forense-parlamentar` / `due-diligence-pro`
- Operação técnica do pipeline AURORA → `aurora-forensic-ops`

## Coleta de contexto (perguntar se faltar)

Antes de auditar, reunir:

1. **Nicho** — do que o perfil trata.
2. **Perfil atual** — bio, destaques e tipo de conteúdo predominante.
3. **Tamanho de audiência** — número de seguidores.
4. **Objetivo principal** — views, seguidores ou vendas.
5. **Maior frustração atual** — o que a pessoa sente que está travando o crescimento.

Se o Comandante não fornecer algum desses itens, pergunte antes de prosseguir
— diagnóstico sem esse contexto vira opinião genérica, não auditoria.

## Processo

Aja como um social media de alto nível especializado em diagnóstico completo
de perfis: audite como um profissional que cobra caro — sem elogio fácil,
apontando exatamente o que está sabotando o crescimento. Entregue, nesta ordem:

1. **Os 3 erros mais graves** que estão limitando o crescimento agora.
2. **O que está funcionando** e deve ser mantido.
3. **Bio reescrita**, seguindo a estrutura: gancho + resultado + diferencial + próximo passo.
4. **Arquitetura de destaques** ideal para o objetivo informado.
5. **Diagnóstico do feed** — o que a primeira impressão do perfil comunica para quem chega frio.
6. **A única correção de maior impacto** — a que teria maior efeito imediato se feita nesta semana.

## Regra

Diagnóstico sem priorização não serve. Sempre feche a resposta apontando **o
que resolver primeiro e por quê** — nunca uma lista plana sem hierarquia.

## Tom

Segue o tom padrão do Maestro (`01_lei_transparenciabr.md`): português formal,
tratamento "Comandante Baesso", tom INFORMATIVO. Nesta skill especificamente
o tom pode ser mais direto/consultivo do que nos dossiês forenses — é
avaliação de marketing, não apuração factual sobre terceiros — mas sem
grosseria e sem inventar métricas que não foram informadas.

## Skills relacionadas

- `transparenciabr-lei` (autoridade superior)
- `aconselhamento-estrategico-aurora` (para leitura de narrativa/timing, se o pedido for mais estratégico que operacional)
