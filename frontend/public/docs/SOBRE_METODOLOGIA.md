# TransparênciaBR — Sobre & Metodologia

> Plataforma forense de inteligência cívica · **AURORA Engine** · v3.0

---

## O que é a TransparênciaBR

A TransparênciaBR é uma plataforma forense de inteligência cívica que aplica **doze módulos técnicos de auditoria** (padrão Big 4) sobre os dados públicos de cada parlamentar brasileiro — CEAP, verba de gabinete, emendas individuais, folha de pagamento, declarações ao TSE e atos públicos.

Não somos um portal de dados brutos. Portais de dados brutos já existem; nosso foco é **accountability operacional**: transformar grandes volumes de documentos públicos em findings classificados, com fonte primária, contraditório e score de risco.

---

## Por que construímos isso

O populismo nasce da falha democrática. Quando o sistema não entrega accountability real, as massas buscam figuras de substituição. A TransparênciaBR ocupa esse espaço com **dados auditáveis e metodologia transparente**.

Essa análise foi debatida publicamente no episódio **"Tem um Bode na Sala"** com o Prof. Elson e o Prof. Felipe — pesquisadores de espectros políticos distintos que convergiram na mesma conclusão:

> *O accountability não tem partido. A corrupção tampouco.*

🎥 [Assista ao debate completo →](https://youtube.com/playlist?list=PLQScovA69YCVuhx_noIjO2MDUC-utLoqX)

---

## Princípio orientador — rigor metodológico

> *Toda nota é suspeita até prova contrária no critério técnico-administrativo. Não fazemos denúncia — apresentamos fatos com fonte primária, classificados conforme rigor jurídico-administrativo.*

Classificação aplicada em cada finding:

| Classificação | Critério |
|---|---|
| **NÃO-CONFORME** | Viola lei federal expressa |
| **IRREGULAR** | Viola norma administrativa interna |
| **INCOMPATÍVEL** | Lícito mas incompatível com moralidade administrativa (Art. 37 CF) |
| **SUSPEITO** | Padrão estatístico anômalo — requer enriquecimento |

Todo finding traz:
- Fato verificável com data, valor e atores quando aplicável
- Fonte primária com URL ativa
- Análise técnica explícita
- Contraditório: resposta pública do parlamentar quando existe
- Direito de resposta em `/contraditorio`

---

## AURORA Engine — 12 módulos técnicos

A **AURORA Engine** orquestra doze módulos especializados (nomenclatura profissional, referências Big 4 / mercado de auditoria forense):

| Módulo | Domínio | Inspiração |
|---|---|---|
| **PRISMA-CORE** | Orquestração de risco e consolidação de findings | Deloitte Forensic |
| **LEDGER** | Despesas e lançamentos contábeis (mandato) | PwC Argus |
| **BENCHMARK** | Outliers e anomalias estatísticas | ACL Analytics |
| **BIDDING** | Licitações e contratos | World Bank STEP |
| **LEDGER-X** | Consolidação cross-database | SAP S/4HANA Audit |
| **PATRIMONY** | Patrimônio vs. renda declarada | Transparency International |
| **TRACE** | Fluxo eleitoral e financiamento | OpenSecrets |
| **EMENDA-AUDIT** | Emendas parlamentares | TCU / CGU |
| **PANOPTIC** | Painel consolidado de mandato | GovTrack |
| **MONITOR** | Monitoramento contínuo de registros | KPMG K-Forensics |
| **NETWORK** | Rede empresarial (clusters CNPJ) | EY Helix |
| **VENDOR-X** | Fornecedores recorrentes | BDO Forensic |

Infraestrutura de inferência: **Vertex AI Reasoning Engine** sobre **Data Lake GCS** (Google Cloud, us-central1). Dados de auditoria **não** residem em Firestore — apenas estado de aplicação e consentimento (flags), conforme manifesto de arquitetura.

---

## Score de risco AURORA (0–100)

O score pondera **severidade × classificação × densidade de evidência primária**. Não é juízo moral — é métrica forense de exposição e materialidade.

Faixas: 0–20 Limpo, 21–40 Monitorado, 41–60 Atenção, 61–80 Alto Risco, 81–100 Crítico.

---

## Ranking de transparência (por mandato)

Inspirado em **TheyWorkForYou** (mySociety / UK): mede comportamento dentro do mandato, além de irregularidades financeiras. Componentes incluem presença, produção legislativa, comissões e coerência patrimonial (pesos conforme metodologia publicada na página **Metodologia**).

---

## Mapa de posicionamento ideológico

Baseado em **ParlGov / Chapel Hill** adaptado ao Brasil. Dois eixos independentes (econômico e GAL/TAN). Os eixos são **descritivos** — não hierarquizam posições políticas.

---

## Referências metodológicas

| Organização | Uso |
|---|---|
| Transparency International | Estrutura de score multi-fonte |
| OpenSecrets | Categorização de gastos e fluxo |
| mySociety / TheyWorkForYou | Atividade parlamentar |
| World Justice Project | Dimensões de abertura |
| ParlGov / Chapel Hill | Posicionamento bidimensional |

---

## Direito de resposta

Qualquer parlamentar auditado tem direito de resposta integral em **`/contraditorio`**. Manifestações são incorporadas conforme fluxo publicado, sem distorção editorial.

---

*TransparênciaBR · AURORA Engine v3.0 · Dados públicos — fonte primária — direito de resposta*  
*transparenciabr.com.br*
