# ROADMAP AUTÔNOMO v1.1: A Ferramenta HTTP Genérica

## 1. Problema

Conforme a lição registrada em memória, a ausência de uma ferramenta para realizar chamadas HTTP genéricas é um bloqueio para a evolução autônoma e a interação com novas APIs ou serviços web que não possuem uma ferramenta dedicada.

## 2. Solução Proposta

Introduzir uma nova ferramenta de `primeira classe` chamada `http_request`. Esta ferramenta permitirá ao Maestro interagir com qualquer endpoint RESTful, enviando dados, recebendo respostas e tratando diferentes métodos (GET, POST, PUT, DELETE).

## 3. Passos de Implementação (Ciclo Atual)

1.  **`[CONCLUÍDO]`** Criar este documento de roadmap (`ROADMAP_AUTONOMO_V1.md`).
2.  **`[EM ANDAMENTO]`** Implementar o código-fonte da ferramenta em `aurora_v3_maestro/tools/http_client.py`. O código será robusto, incluindo tratamento de erros, timeouts e suporte para headers e JSON payloads.
3.  **`[EM ANDAMENTO]`** Propor a definição da nova ferramenta em `aurora_v3_maestro/prompts/PROMPT_EVOLUTION_PROPOSAL.md` para futura integração ao System Prompt.
4.  **`[EM ANDAMENTO]`** Criar um `CHANGELOG_AUTONOMO.md` para registrar esta evolução.
5.  **`[PENDENTE]`** Revisão e aprovação do Comandante Baesso.
6.  **`[PENDENTE]`** Integração da nova ferramenta ao worker do Maestro e deploy de uma nova versão.

## 4. Objetivo Final

Capacitar o Maestro com uma ferramenta fundamental para a exploração e interação autônoma com a web, diminuindo a dependência de ferramentas pré-definidas e acelerando a capacidade de adaptação a novos desafios.
