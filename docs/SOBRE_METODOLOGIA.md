# TransparênciaBR — Sobre & Metodologia

> *"Aqui não tem fla-flu. Tem R$ 93 mil de CEAP pago no nome de terceiros — e isso é ILEGAL independente do partido."*

---

## O que é a TransparênciaBR

A TransparênciaBR é uma plataforma forense de inteligência cívica que aplica **12 agentes de inteligência artificial especializados** sobre os dados públicos de cada parlamentar brasileiro — CEAP, Verba de Gabinete, emendas individuais, folha de pagamento, declarações ao TSE e atos públicos.

Não somos um portal de dados brutos. Portais de dados brutos já existem e ninguém os usa.

Somos uma **engine forense**: transformamos 5.000 notas fiscais em 15 findings classificados juridicamente, com fonte primária, contraditório e score de risco — entregues em segundos, sob demanda.

---

## Por que construímos isso

O populismo nasce da falha democrática. Quando o sistema não entrega accountability real, as massas buscam figuras messiânicas como substituto. O problema não é o populista — é o vácuo que ele ocupa.

A TransparênciaBR ocupa esse vácuo com dados.

Essa análise foi debatida publicamente no episódio **"Tem um Bode na Sala"** com o Prof. Elson (Maçonaria e pensamento liberal) e o Prof. Felipe (psicologia do populismo) — pesquisadores de espectros políticos distintos que chegaram, junto com o fundador da plataforma, à mesma conclusão:

> *O accountability não tem partido. A corrupção tampouco.*

🎥 [Assista ao debate completo →](https://youtube.com/playlist?list=PLQScovA69YCVuhx_noIjO2MDUC-utLoqX)

---

## Princípio Orientador — Rigor 100%

> *"Toda nota é suspeita até prova contrária. R$ 100 de gasolina é tão criminoso quanto R$ 3.000 se não couber no mandato. Não fazemos denúncia — apresentamos fatos com fonte primária, classificados como ILEGAL, IRREGULAR, IMORAL ou SUSPEITO conforme rigor jurídico-administrativo."*

Classificação tripartida aplicada em cada finding:

| Classificação | Critério |
|---|---|
| **ILEGAL** | Viola lei expressa (ex: Resolução nº 30/2001 CEAP, Lei 7.102/83) |
| **IRREGULAR** | Viola norma administrativa interna da Câmara |
| **IMORAL** | Lícito mas afronta moralidade administrativa (Art. 37 CF) |
| **SUSPEITO** | Padrão estatístico anômalo — requer enriquecimento de dados |

Todo finding traz:
- ✅ Fato verificável com data, valor e ator nominados
- ✅ Fonte primária com URL ativa
- ✅ Análise jurídica-normativa explícita
- ✅ Contraditório: resposta pública do parlamentar quando existe
- ✅ Direito de resposta garantido em `/dossie/{id}/contestacao`

---

## A Engine ASMODEUS — 12 Agentes Vertex AI

ASMODEUS coordena 12 agentes especializados, cada um responsável por um domínio forense:

| Agente | Domínio | O que detecta |
|---|---|---|
| **LÚCIFER** | Vinculação ao mandato | Despesa fora do Art. 1º do Ato 43/2009 |
| **BELZEBU** | Fornecedor / CNPJ | Empresa laranja, sem funcionários, CNAE incompatível |
| **BELIAL** | Lei de Benford | Anomalia estatística no primeiro dígito dos valores |
| **LEVIATÃ** | Geografia & movimentação | Nota em cidade incompatível com agenda parlamentar |
| **MAMMON** | Combustível & transporte | Quilometragem absurda, dois postos no mesmo dia |
| **ASTAROTH** | Alimentação & hospedagem | Restaurante de luxo em dia de evento, valor fora da curva |
| **BAEL** | Divulgação & mídia | Gráficas no período eleitoral, slogan camuflado |
| **PAIMON** | Consultoria & escritório | Consultoria sem produto entregável, endereço residencial |
| **MURMUR** | Telefonia & aviação | Linhas além do necessário, fretamento em rota com voo regular |
| **BUNE** | Folha & rachadinha | Protocolo F.L.A.V.I.O. — CPF × Receita × TSE × redes sociais |
| **FORNEUS** | Comportamental & padrão | Descompasso entre consumo ostensivo e capacidade declarada |
| **ASMODEUS** | Coordenador supremo | Compila findings, calibra severidade, gera o dossiê final |

Cada agente roda no **Vertex AI Reasoning Engine** sobre o Data Lake GCS da TransparênciaBR — zero dados em servidores externos. Soberania de dados aplicada à transparência cívica.

---

## Score de Risco ASMODEUS (0–100)

O score pondera **severidade × classificação × densidade de evidência primária**. Não é nota moral — é métrica forense de quanto ainda resta auditar.

```
Score = Σ (Severity_i × Classificação_j × Densidade_k) → normalizado 0–100

Severity:      CRITICAL=4  ·  HIGH=3  ·  MEDIUM=2  ·  LOW=1
Classificação: ILEGAL=4    ·  IRREGULAR=3  ·  IMORAL=2  ·  SUSPEITO=1
Densidade:     OCR primário=3  ·  Fonte jornalística=2  ·  Padrão estatístico=1
```

| Score | Faixa | Cor no Universo | Ação recomendada |
|---|---|---|---|
| 0–20 | Limpo | 🟢 Verde | Sem alerta |
| 21–40 | Monitorado | 🔵 Azul | Acompanhamento |
| 41–60 | Atenção | 🟡 Amarelo | Auditoria recomendada |
| 61–80 | Alto Risco | 🟠 Laranja | Auditoria crítica |
| 81–100 | Crítico | 🔴 Vermelho pulsante | MPF / TCU / CCJ exigidos |

---

## Ranking de Transparência (por mandato)

Inspirando-se no **TheyWorkForYou** (mySociety/UK) — mede comportamento dentro do mandato, não apenas irregularidades financeiras:

```
Ranking = (
  30% × Score CEAP limpo
  20% × Taxa de presença em votações
  20% × Clareza na destinação de emendas
  15% × Ausência de anomalias F.L.A.V.I.O. na folha
  15% × Coerência patrimonial TSE
)
```

O ranking completo dos 594 parlamentares aparece no **Painel Central** — atualizado a cada nova rodada do pipeline.

---

## Mapa de Posicionamento Ideológico

Baseado na metodologia **ParlGov / Chapel Hill Survey** adaptada para o contexto brasileiro. Dois eixos independentes:

**Eixo X — Econômico**
- Esquerda: Estado desenvolvimentista, proteção social, política industrial
- Direita: Mercado, privatização, austeridade fiscal
- Calculado por: votações em pautas econômicas + financiadores de campanha (TSE)

**Eixo Y — Social/Cultural**
- Progressista: direitos LGBTQIA+, reforma agrária, políticas afirmativas
- Conservador: pauta de costumes, família tradicional, segurança pública dura
- Calculado por: votações em pautas de costumes + aderência a frentes parlamentares + NLP sobre discursos no Plenário

> **Nota metodológica:** O liberalismo no Brasil não equivale ao europeu. Seguindo a análise de Roberto Schwarz sobre "ideias fora do lugar", um parlamentar pode ser economicamente liberal e politicamente clientelista. Os dois eixos são **independentes por design** — um deputado pode ser Direita Progressista ou Esquerda Conservadora, e o algoritmo respeita essa complexidade.

O mapa aparece na **Hotpage de cada parlamentar** com os 5 parlamentares mais próximos ideologicamente mostrados como orbes adjacentes — criando o grafo de conexões navegável.

---

## Referências Metodológicas

| Agência | País | O que inspirou |
|---|---|---|
| Transparency International | Global | Estrutura de score normalizado multi-fonte (CPI) |
| OpenSecrets | EUA | Categorização de gastos por finalidade e personal finances |
| mySociety / TheyWorkForYou | UK | Score de atividade parlamentar + aderência partidária |
| World Justice Project | Global | Open Government Index — 4 dimensões de abertura |
| ParlGov / Chapel Hill Survey | Europa | Posicionamento ideológico bidimensional de partidos |

---

## Direito de Resposta

Qualquer parlamentar auditado tem direito de resposta integral garantido em `/dossie/{id}/contestacao`.

Manifestações são incorporadas ao dossiê em até 24h, sem edição. Findings desconstruídos com prova documental são imediatamente retirados da plataforma.

**Esta é a regra do Princípio Rigor 100%: o ônus do erro é de quem publica.**

---

*TransparênciaBR · ASMODEUS ENGINE v2.0 · 12 agentes Vertex AI · 335 filtros forenses*  
*Dados públicos — fontes primárias — direito de resposta garantido*  
*transparenciabr.com.br*
