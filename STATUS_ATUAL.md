# STATUS ATUAL — TransparênciaBR

## Dados no BigQuery (dataset: transparenciabr.transparenciabr, location: US)

| Tabela | Rows | Notas |
|---|---|---|
| ceap_despesas | 617.563 | 833 parlamentares, cols: parlamentar_id, nome_parlamentar, valor_documento, nome_fornecedor, tipo_despesa, data_emissao, url_documento |
| ceap_despesas_ext (tbr_ceap) | 5.155.757 | Histórico completo |
| emendas | 32.183 | R$71.5B empenhado, 1.012 autores individuais |
| tb_dossie_aurora_360 | 835 | APENAS texto genérico (409 chars!), NÃO tem JSON estruturado |
| vw_benford_ceap_audit | 6.654 | Auditoria Benford por parlamentar |
| passagens_aereas | 156.242 | R$118.9M |
| dossie_pre_computed | NÃO EXISTE | Job G ainda não rodou |

## PROBLEMA PRINCIPAL
- tb_dossie_aurora_360 tem apenas texto genérico ("RELATÓRIO DE INTELIGÊNCIA AURORA - Nome. ATIVIDADE FINANCEIRA: total R$X via CEAP...")
- NÃO tem JSON estruturado, NÃO tem emendas detalhadas, NÃO tem fornecedores
- Job G (dossie_grounded_massa.py) que geraria dossiês ricos com Gemini NUNCA RODOU
- dossie_pre_computed table NÃO EXISTE

## O QUE FUNCIONA
- getDossieAurora CF: deployed, serves from tb_dossie_aurora_360 + cross-queries CEAP/emendas/Benford
- AuroraInsightsSection: deployed no frontend (DossiePage + PoliticoPage)
- getSacanagens.js: criado mas NÃO deployed
- Roster: 594 (513 dep + 81 sen)
- getPoliticoDespesas: funciona com ?nome= e ?id=

## O QUE PRECISA SER FEITO
1. getDossieAurora já faz cross-query em tempo real (CEAP + emendas + Benford) — é o caminho certo
2. Melhorar o getDossieAurora para incluir TODOS os aspectos: emendas detalhadas, fornecedores, temporal, sacanagens
3. Frontend DossiePage precisa exibir tudo isso
4. Dossiê on-demand: quando clica "atualizar", puxa dados frescos das APIs (Câmara, Senado, SIOP)
