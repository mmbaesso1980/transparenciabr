# LGPD.md — Radar Jurídico INSS

**Versão:** 1.0 scaffold  
**Aprovado por:** Comandante Maurílio Baesso · 2026-05-30 12:03 BRT  
**Referências legais:** LGPD Lei 13.709/2018 · Marco Civil da Internet Lei 12.965/2014

---

## Princípio geral

O Radar Jurídico INSS opera sob a doutrina **"Não denunciamos, mostramos"**:
exibe dados de fontes públicas (DOU, dados.gov.br/INSS, PJe público) organizados
de forma legível para profissionais jurídicos habilitados. **A interpretação e a
decisão de contato cabem exclusivamente ao advogado.**

Nenhum dado PII (CPF completo, telefone, endereço) é exibido ao usuário sem
o cumprimento de uma das 4 bases legais do pipeline AURORA.

---

## 1. Dados da fonte pública (sem PII direto)

Os microdados de indeferimentos INSS publicados em `dados.gov.br` são
**anônimos por design LGPD** (art. 6º minimização + art. 11 saúde).
Não contêm CPF nem nome do beneficiário.

Campos disponíveis na fonte pública:
- `mes_referencia` — mês do indeferimento
- `dt_nascimento` — data de nascimento (sem nome)
- `sexo`, `uf`, `especie_codigo`, `especie_nome`
- `motivo_indeferimento`, `dt_indeferimento`, `dt_der`
- `clientela`, `forma_filiacao`, `ramo_atividade`
- `aps_codigo`, `aps_nome` — agência INSS (proxy geográfico)

**O Radar Jurídico NUNCA exibe CPF em claro ao frontend.**
CPF aparece apenas como hash SHA-256 nos logs de auditoria.

---

## 2. Os 4 caminhos legais do pipeline AURORA

O enriquecimento com PII direto (CPF, telefone, e-mail) só ocorre no backend,
via um dos 4 caminhos abaixo, cada um com sua base legal específica:

### Caminho A — DATAPREV Convênio Oficial

**Base legal:** LGPD art. 7º, inciso III (execução de políticas públicas) +
convênio formal com DATAPREV/INSS assinado pelo escritório.

| Atributo | Valor |
|---|---|
| Status | 503 até convênio firmar |
| Custo | R$ 0 (acesso conveniado) |
| PII disponível | CPF, nome, endereço, dados do benefício |
| Retenção | 5 anos após encerramento do processo |
| Arquivo | `functions/enrichment/connectors/dataprev_oficial.js` (adaptado para backend Python em `backend/src/services/aurora_enricher.py`) |

**Condição de ativação:** `DATAPREV_ENABLED=true` no Secret Manager.
Por padrão, retorna HTTP 503 com mensagem clara de aguardo do convênio.

### Caminho B — Bureau de Crédito (Serasa / Quod)

**Base legal:** LGPD art. 7º, inciso IX (legítimo interesse do responsável pelo tratamento)
— escritório de advocacia tem interesse legítimo em localizar potenciais clientes
cujos direitos foram negados administrativamente, para fins de acesso à justiça.

| Atributo | Valor |
|---|---|
| Status | Pronto, aguarda credenciais de contrato |
| Custo | R$ 0,30–1,50 por CPF consultado |
| PII disponível | CPF, telefone, e-mail, endereço, score Serasa |
| Budget diário | Configurável via `BUDGET_DIARIO_BRL` (default: R$ 500) |
| Circuit breaker | Automático via `serasa_quod.js` (adaptado) |
| Retenção | Cache 30 dias em `enrichment_cache`; audit log 5 anos |
| Arquivo | `backend/src/services/aurora_enricher.py` (Caminho B) |

**Alerta LGPD obrigatório:** Toda consulta ao bureau grava registro em
`lgpd_audit_radar` com `cpf_hash` (SHA-256) + `connector=serasa_quod` +
`trace_id` + `timestamp`. CPF **nunca em claro** no log.

### Caminho C — Consentimento Explícito (/sou-indeferido)

**Base legal:** LGPD art. 7º, inciso I (consentimento do titular)

O cidadão acessa voluntariamente a landing page `/sou-indeferido` (já implementada
em `frontend/src/pages/ConsentForm/ConsentForm.tsx`), preenche seus dados e
consente expressamente com o uso de seus dados pelo escritório parceiro.

| Atributo | Valor |
|---|---|
| Status | Funcional (PR #230 merged) |
| Custo | R$ 0 |
| PII disponível | CPF, nome, telefone, e-mail, UF (auto-informado) |
| Retenção | 5 anos ou até retirada do consentimento |
| Arquivo | `functions/enrichment/connectors/consent_form.js` |

**Importante para o Radar Jurídico:** O Caminho C gera leads de **qualidade
máxima** (consentimento explícito + intenção declarada). O pipeline de alertas
deve priorizar leads do Caminho C quando disponíveis.

### Caminho D — Petição Template (cliente no escritório)

**Base legal:** LGPD art. 7º, inciso V (execução de contrato / prestação de serviços)

Quando o cliente chega fisicamente ao escritório com seu CPF e documentação,
o advogado insere os dados manualmente, o sistema gera uma petição inicial
pré-preenchida em DOCX e armazena o vínculo no Firestore.

| Atributo | Valor |
|---|---|
| Status | Pronto (falta DOCX template no GCS) |
| Custo | R$ 0 |
| PII disponível | CPF, nome, documentos (informados pelo cliente) |
| Retenção | Enquanto vigente o contrato de honorários + 5 anos |
| Arquivo | `functions/enrichment/connectors/peticao_template.js` |

**Integração Radar Jurídico:** Após geração da petição, o lead é marcado
como `origem=escritorio_presencial` no Firestore e excluído dos alertas
automáticos (já em atendimento).

---

## 3. Retenção e descarte de dados

| Tipo de dado | Retenção | Descarte |
|---|---|---|
| Microdados INSS (sem PII) | Indefinido (fonte pública) | — |
| Leads enriquecidos (Caminho B) | 30 dias no cache; 5 anos no audit | Exclusão automática via TTL |
| Leads por consentimento (Caminho C) | 5 anos | Solicitação do titular via e-mail |
| Petições geradas (Caminho D) | Duração do mandato + 5 anos | Encerramento do processo |
| Logs de auditoria LGPD | 5 anos | Somente por decisão judicial |
| Alertas watchlist | Enquanto ativo + 90 dias de histórico | Usuário arquiva ou cancela |

---

## 4. Dados do usuário final (advogado / escritório)

O Radar Jurídico coleta dados do **usuário da plataforma** (não do cidadão INSS):

| Dado | Base legal | Uso |
|---|---|---|
| E-mail, nome (Google OAuth) | Contrato de prestação de serviço | Auth + notificações |
| Histórico de buscas | Legítimo interesse (segurança + debugging) | Retenção: 90 dias |
| Créditos consumidos | Execução de contrato | Audit financeiro: 5 anos |
| Alertas configurados | Execução de contrato | Até cancelamento + 90 dias |

---

## 5. Checklist LGPD antes do deploy (Maestro)

- [ ] `lgpd_audit_radar` tabela BigQuery criada (ver `schemas/bigquery_radar_juridico.sql`)
- [ ] Todo call ao Caminho B/C/D grava em `lgpd_audit_radar` antes de retornar dados
- [ ] CPF nunca aparece em logs de Cloud Run (use `cpf_hash` = SHA-256)
- [ ] `DATAPREV_ENABLED=false` por padrão no Secret Manager
- [ ] Política de privacidade atualizada para incluir o Radar Jurídico (rota `/privacidade`)
- [ ] Consentimento explícito registrado em `leads_finalizados.origem='consent_form'`
- [ ] TTL de 30 dias configurado em `enrichment_cache` (Firestore TTL policy)
- [ ] Header LGPD em todo CSV exportado:
  ```
  # TransparenciaBR - Radar Juridico INSS
  # Base legal: LGPD art. 7 IX (legitimo interesse) | art. 11 II g (saude)
  # Fonte: dados.gov.br - Beneficios Indeferidos (dados publicos)
  # Diagnostico final cabe exclusivamente ao advogado responsavel.
  # Descadastro: contato@transparenciabr.com.br
  ```

---

## 6. O que o Radar Jurídico NUNCA faz

1. Exibir CPF completo ao frontend em qualquer circunstância
2. Consultar bureau de crédito sem base legal registrada em `lgpd_audit_radar`
3. Armazenar dados PII em texto claro no Firestore ou BigQuery
4. Enviar notificação de alerta sem verificar litispendência PJe primeiro
5. Compartilhar dados de leads entre usuários diferentes da plataforma
6. Usar dados do cidadão INSS para fins além da identificação de potenciais direitos
