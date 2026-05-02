# TransparênciaBR — Metodologia & Disclaimer

> Plataforma Forense de Inteligência Cívica · **AURORA Engine**
> v3.0 · 12 Módulos Técnicos · Padrão Big 4

## 1. Natureza da Plataforma

A TransparênciaBR é uma plataforma de auditoria forense automatizada que aplica inteligência artificial sobre dados públicos de parlamentares brasileiros. A plataforma não constitui denúncia, não substitui investigação oficial e não emite juízo de valor sobre espectro político ou conduta pessoal.

Toda informação publicada é:
- Derivada de fontes primárias públicas com URL ativa
- Classificada por critério técnico-administrativo, não editorial
- Acompanhada de contraditório quando o parlamentar se manifestou publicamente
- Passível de contestação formal pelo parlamentar auditado

## 2. Fontes de Dados

Portal de Dados Abertos da Câmara, SIAFI, TSE, Receita Federal, Diário Oficial da União (DOU/INLABS), Diários Oficiais Estaduais, Notas Fiscais CEAP, Portal Nacional de Contratações Públicas (PNCP), IBGE/SIDRA. Nenhum dado privado, sigiloso ou protegido por segredo de justiça é utilizado.

Metodologia inspirada em práticas das Big 4 de auditoria — **Deloitte Forensic**, **PwC Argus**, **EY Helix**, **KPMG K-Forensics** — adaptada à realidade brasileira.

## 3. Os Três Scores

### 3.1. Score de Risco AURORA (0–100)
Mensura grau de irregularidade ou anomalia estatística no uso de recursos públicos vinculados ao mandato. Referências: Transparency International, OpenSecrets, ICRG/PRS Group.

Classificação dos findings:
- **NÃO-CONFORME**: fato não está em conformidade com lei federal expressa
- **IRREGULAR**: fato viola norma administrativa interna
- **INCOMPATÍVEL**: fato lícito mas incompatível com moralidade administrativa (Art. 37 CF)
- **SUSPEITO**: padrão estatístico anômalo que requer enriquecimento

Faixas: 0-20 Limpo, 21-40 Monitorado, 41-60 Atenção, 61-80 Alto Risco, 81-100 Crítico.

### 3.2. Posicionamento Ideológico
Eixo X (Econômico) e Eixo Y (GAL/TAN). Referências: Chapel Hill Expert Survey, V-Dem Institute, ParlGov. Mensuração descritiva, não atribui superioridade a nenhum polo.

### 3.3. Ranking de Qualidade Parlamentar (0–100)
Presença 25%, Produção 30%, Comissões 20%, Fiscalização 15%, Representatividade 10%. Referências: mySociety, GovTrack, DIAP, FGV.

## 4. AURORA Engine — 12 Módulos Técnicos

| Módulo | Função | Inspiração |
|---|---|---|
| **PRISMA-CORE** | Orquestrador central de risco | Deloitte Forensic |
| **LEDGER** | Análise de despesas e lançamentos contábeis | PwC Argus |
| **BENCHMARK** | Detecção de outliers estatísticos | ACL Analytics |
| **BIDDING** | Análise de licitações e contratos | World Bank STEP |
| **LEDGER-X** | Operações cross-database (consolidação) | SAP S/4HANA Audit |
| **PATRIMONY** | Evolução patrimonial vs. renda declarada | Transparency Int'l |
| **TRACE** | Rastreamento de fluxo eleitoral | OpenSecrets |
| **EMENDA-AUDIT** | Auditoria de emendas parlamentares | TCU/CGU |
| **PANOPTIC** | Painel consolidado de mandato | GovTrack |
| **MONITOR** | Monitoramento contínuo de registros | KPMG K-Forensics |
| **NETWORK** | Análise de rede empresarial (clusters CNPJ) | EY Helix |
| **VENDOR-X** | Cruzamento de fornecedores recorrentes | BDO Forensic |

Todos os módulos rodam sobre **Vertex AI Reasoning Engine** (Google Cloud) operando sobre Data Lake GCS. Infraestrutura 100% GCP us-central1.

## 5. Direito de Resposta
Qualquer parlamentar auditado tem direito de resposta integral em `/contraditorio`. Manifestações incorporadas em até 24h, sem edição.

## 6. Disclaimer Legal

1. A TransparênciaBR apresenta fatos públicos auditáveis. Não constitui denúncia formal.
2. Nenhum score equivale a condenação, acusação ou juízo de culpa.
3. Todos os parlamentares gozam de presunção de inocência até decisão judicial transitada em julgado.
4. As classificações NÃO-CONFORME, IRREGULAR, INCOMPATÍVEL ou SUSPEITO referem-se à natureza técnico-administrativa do fato apurado, não à conduta pessoal do parlamentar.
5. O posicionamento GAL/TAN é descritivo.
6. Ranking baixo não implica má-fé.
7. Scores são métricas forenses automatizadas — não substituem parecer jurídico.
8. Dados processados são exclusivamente públicos.
9. Ferramentas de IA e OCR podem produzir erros. Verifique sempre as fontes primárias.
10. Cadastro na plataforma exige aceite expresso de Termos, Privacidade e Ciência sobre IA.

---
TransparênciaBR · transparenciabr.com.br · v3.0 · 01/05/2026
