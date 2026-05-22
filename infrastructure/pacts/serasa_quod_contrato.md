# Checklist comercial — Bureau (Serasa / Quod) — Caminho B

**Comandante Baesso** — motor **AURORA** (TransparênciaBR)

## 1. Volume e pricing

- Volume estimado inicial: **~2.000 consultas/mês** (ajustável).
- Faixa de referência de mercado (indicativa): **R$ 0,30–1,50** por consulta simples (telefone ou endereço), conforme pacote e SLA.
- Pedir **tabela corporativa** fechada e cláusula de **teto mensal** em R$.

## 2. Contrato e DPA

- Contrato de prestação de serviços com **DPA LGPD** anexo (art. 37 LGPD — encargos do operador).
- Cláusulas de **suboperadores** (cloud, suporte) com lista fechada ou pré-aprovação.
- **Notificação de incidentes** em até 72 horas.

## 3. Finalidade e minimização

- Finalidade declarada: **enriquecimento para assessoria jurídica em revisão de indeferimento INSS**.
- Proibir reutilização para **marketing** ou scoring de crédito sem novo fundamento.

## 4. Evidências e auditoria

- Fatura com **SKU por tipo de consulta**.
- API com **id de consulta** correlacionável ao `lgpd_audit_log` (hash de CPF + timestamp).

## 5. Saída técnica

- Campos mínimos: lista de telefones com **confiança** e **data de atualização**; e-mails opcionais.
- Formato **JSON** estável + versionamento de API.

---

*Documento de apoio à negociação — não substitui parecer jurídico.*
