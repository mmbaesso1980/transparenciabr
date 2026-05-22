# Modelo de convénio INSS / DATAPREV — OAB Carpes (Caminho A)

**Destinatário**: Comandante Marcelo Baesso — motor **AURORA** (TransparênciaBR)  
**Finalidade**: Acesso a dados cadastrais estritamente necessários à revisão de indeferimentos previdenciários, com base em convénio institucional.

## 1. Cabeçalho e partes

- **Titular dos dados**: Instituto Nacional do Seguro Social (INSS) / Dataprev, na qualidade de controlador ou co-controlador, conforme o caso.
- **Operador / beneficiário do convénio**: Ordem dos Advogados do Brasil — secção competente (Carpes) e/ou escritório credenciado.
- **Finalidade declarada**: instrução de pedidos de revisão administrativa e judicial de benefícios indeferidos, sem finalidade de marketing.

## 2. Base legal (LGPD + LC 105/2001)

- **LGPD art. 7º, X** — proteção da vida e incolumidade física, quando aplicável ao caso concreto.
- **LGPD art. 7º, IX** — legítimo interesse, com teste de balanceamento e transparência ao titular.
- **LC 105/2001** e normas correlatas de sigilo fiscal e previdenciário — observância de restrições de acesso e registo de consultas.

## 3. Escopo técnico dos dados

- Identificação civil mínima (nome, filiação quando aplicável, data de nascimento, NIS/CPF).
- Endereço e contactos **somente** quando indispensáveis à citação ou comprovação de residência fiscal.
- Histórico sintético de benefícios e indeferimentos **vinculado** ao NIS informado.

## 4. Medidas de segurança

- Autenticação mútua (**mTLS**) e troca de **JWT** assinado.
- Registo de **auditoria** por consulta (hash do CPF, finalidade, timestamp, operador OAB).
- Retenção alinhada ao prazo legal (referência interna: **1825 dias** para logs operacionais, salvo obrigação legal diversa).

## 5. Prazo e revisão

- Vigência inicial proposta: **12 meses**, com renovação expressa.
- Revisão anual de volume, custo e conformidade LGPD.

## 6. Contrapartida

- Relatório agregado (sem PII) sobre volume de consultas e taxa de sucesso em revisões, para afinamento de políticas de atendimento.

---

*Texto-modelo informativo — exige revisão jurídica local antes de assinatura.*
