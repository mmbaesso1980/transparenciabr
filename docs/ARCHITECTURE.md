# Arquitetura de Alto Nível - TransparênciaBR

Este documento descreve a arquitetura de sistema do projeto TransparênciaBR, incluindo a interação entre os múltiplos projetos GCP e os serviços principais.

## 1. Visão Geral Cross-Project

O sistema opera em dois projetos Google Cloud distintos para separar os custos de infraestrutura web/dados dos custos de computação de IA, aproveitando créditos específicos.

| Projeto | Número do Projeto | Função Principal | Faturamento |
|---|---|---|---|
| `transparenciabr` | `89728155070` | Hosting, Funções de Gatilho, Banco de Dados (Firestore), Datalake (BigQuery) | Faturamento padrão |
| `projeto-codex-br` | `282847675243` | Execução de IA (Vertex AI), Workers (Cloud Run), Orquestração (Pub/Sub) | **Créditos promocionais** |

**Regra de Ouro:** Toda a computação de IA (chamadas Gemini/Vertex) **deve** ser executada no `projeto-codex-br` para consumir os créditos disponíveis.

## 2. Fluxo de Dados e Componentes Principais

O fluxo de uma solicitação de dossiê, por exemplo, passa por vários componentes nos dois projetos:

1.  **Frontend (React)**:
    *   **Serviço:** Firebase Hosting
    *   **Projeto:** `transparenciabr`
    *   **URL:** `transparenciabr.web.app`
    *   **Descrição:** Interface do usuário onde o Comandante inicia ações, como a geração de um dossiê.

2.  **Gatilho da Ação**:
    *   **Serviço:** Cloud Functions (Callable Function)
    *   **Projeto:** `transparenciabr`
    *   **Descrição:** Uma função simples (`iniciarDossieV1`) recebe a chamada do frontend e publica uma mensagem na fila de tarefas.

3.  **Fila de Tarefas (Orquestração)**:
    *   **Serviço:** Pub/Sub
    *   **Projeto:** `projeto-codex-br`
    *   **Tópico:** `dossie-v1-pipeline` (ou `maestro-commands` para o Maestro)
    *   **Descrição:** Desacopla o gatilho inicial do processamento pesado. A mensagem com os detalhes da tarefa é enfileirada aqui.

4.  **Worker de Processamento (IA)**:
    *   **Serviço:** Cloud Run (Job ou Service)
    *   **Projeto:** `projeto-codex-br`
    *   **Descrição:** O principal "cérebro". Um ou mais workers (ex: `dossieV1Pipeline`, `maestro-worker`) escutam a fila do Pub/Sub. Eles executam a lógica principal, chamam a Vertex AI para análise, consultam o BigQuery e o Direct Data, e geram os resultados.

5.  **Motor de IA**:
    *   **Serviço:** Vertex AI
    *   **Projeto:** `projeto-codex-br`
    *   **Modelos:** `gemini-2.5-pro`, `gemini-2.5-flash`
    *   **Descrição:** Realiza as análises complexas, geração de texto, classificação e a maior parte do trabalho de inteligência.

6.  **Banco de Dados e Estado**:
    *   **Serviço:** Firestore
    *   **Projeto:** `transparenciabr`
    *   **Coleções:** `dossies_v1`, `maestro_audit_log`, `maestro_memory`, etc.
    *   **Descrição:** Armazena o estado das tarefas, os resultados parciais, os logs de auditoria e a memória de longo prazo do Maestro. É acessado pelo Worker no `projeto-codex-br` através de permissões IAM cross-project.

7.  **Datalake Forense**:
    *   **Serviço:** BigQuery
    *   **Projeto:** `transparenciabr`
    *   **Datasets:** `transparenciabr` (dados forenses), `tbr_leads_prev` (dados de leads INSS)
    *   **Descrição:** Armazena os grandes volumes de dados públicos (CEAP, emendas, etc.) que servem de base para as análises.

8.  **Armazenamento de Artefatos**:
    *   **Serviço:** Cloud Storage
    *   **Projeto:** `transparenciabr`
    *   **Buckets:** `gs://transparenciabr-dossies/`, `gs://transparenciabr-evidence/`
    *   **Descrição:** Guarda os artefatos finais, como os PDFs dos dossiês e as evidências coletadas.

## 3. O Agente Maestro

O Maestro é um agente autônomo com uma arquitetura híbrida:

*   **Listener (Telegram)**: Roda como um serviço `maestro-listener.service` (systemd) na VM `aurora-cacador-br` no projeto `transparenciabr`. Ele escuta os comandos do Comandante Baesso no Telegram e os publica no tópico Pub/Sub `maestro-commands`.
*   **Worker (Cérebro)**: É um serviço Cloud Run (`maestro-worker`) no `projeto-codex-br`. Ele escuta o tópico `maestro-commands`, executa o loop de raciocínio (Planejar, Executar, Validar), chama as ferramentas (incluindo a si mesmo via Vertex AI) e responde ao Comandante.

Este design garante que o Listener seja persistente (vantagem da VM), enquanto o Worker é escalável, seguro e utiliza os créditos de IA do projeto correto (vantagens do Cloud Run).
