-- ============================================================
-- VIEWS PRA DEMO REUNIÃO MARCO CARPES — SEGUNDA-FEIRA
-- Pre-baked queries que vou rodar ao vivo no laptop
-- ============================================================

-- VIEW 1: Volume Brasil por UF (último mês) — abre apresentação
CREATE OR REPLACE VIEW `tbr_leads_prev.v_brasil_por_uf` AS
SELECT
  uf,
  COUNT(*) AS total_leads,
  COUNTIF(score_pre >= 75) AS leads_alto_potencial,
  ROUND(COUNTIF(score_pre >= 75) * 100.0 / COUNT(*), 1) AS pct_alto
FROM `tbr_leads_prev.leads_brasil_base`
WHERE competencia = '202603'  -- março 2026
GROUP BY uf
ORDER BY total_leads DESC;

-- VIEW 2: Região Carpes Mathias — foco demo
CREATE OR REPLACE VIEW `tbr_leads_prev.v_regiao_carpes` AS
SELECT
  competencia,
  aps,
  especie,
  motivo,
  COUNT(*) AS qtd,
  AVG(score_pre) AS score_medio
FROM `tbr_leads_prev.leads_brasil_base`
WHERE uf = 'São Paulo'
  AND UPPER(aps) IN (
    'VALINHOS', 'VINHEDO', 'ITATIBA', 'CAMPINAS', 'PIRASSUNUNGA',
    'LIMEIRA', 'RIO CLARO', 'JUNDIAI', 'BRAGANCA PAULISTA',
    'PORTO FERREIRA', 'SAO JOAO DA BOA VISTA', 'AMERICANA',
    'SUMARE', 'MOGI MIRIM', 'MOGI GUACU', 'ARARAS', 'LEME',
    'SANTA BARBARA D OESTE', 'NOVA ODESSA', 'INDAIATUBA',
    'HORTOLANDIA', 'PAULINIA', 'COSMOPOLIS', 'ARTUR NOGUEIRA'
  )
GROUP BY competencia, aps, especie, motivo
ORDER BY competencia DESC, qtd DESC;

-- VIEW 3: Top teses jurídicas Brasil (por sub_vertical)
CREATE OR REPLACE VIEW `tbr_leads_prev.v_top_teses` AS
SELECT
  sub_vertical,
  tese_juridica_curta,
  COUNT(*) AS qtd_leads,
  AVG(score_conversao_0_100) AS score_medio,
  AVG(ticket_estimado_brl) AS ticket_medio_brl
FROM `tbr_leads_prev.leads_brasil_gemma`
WHERE gemma_ok = TRUE
GROUP BY sub_vertical, tese_juridica_curta
HAVING qtd_leads >= 50
ORDER BY qtd_leads DESC
LIMIT 100;

-- VIEW 4: Funil pirâmide (números pra slide)
CREATE OR REPLACE VIEW `tbr_leads_prev.v_funil_piramide` AS
SELECT
  'BASE Brasil (todos)'         AS camada, COUNT(*) AS leads, 1 AS ordem
FROM `tbr_leads_prev.leads_brasil_base`
UNION ALL
SELECT 'GEMMA (top 30%)',          COUNT(*), 2 FROM `tbr_leads_prev.leads_brasil_gemma`
UNION ALL
SELECT 'FLASH (top 10%)',          COUNT(*), 3 FROM `tbr_leads_prev.leads_brasil_flash`
UNION ALL
SELECT 'PRO — dossiê pronto (1%)', COUNT(*), 4 FROM `tbr_leads_prev.leads_brasil_pro`
ORDER BY ordem;

-- VIEW 5: Leads alta urgência região Carpes (cherry-pick pro Marco)
CREATE OR REPLACE VIEW `tbr_leads_prev.v_carpes_alta_urgencia` AS
SELECT
  competencia,
  aps,
  especie,
  motivo,
  sub_vertical,
  tese_juridica_curta,
  score_conversao_0_100,
  ticket_estimado_brl,
  urgencia
FROM `tbr_leads_prev.leads_brasil_gemma`
WHERE uf = 'São Paulo'
  AND urgencia = 'alta'
  AND score_conversao_0_100 >= 80
  AND UPPER(aps) IN (
    'VALINHOS', 'VINHEDO', 'CAMPINAS', 'PIRASSUNUNGA', 'LIMEIRA',
    'RIO CLARO', 'JUNDIAI', 'AMERICANA', 'INDAIATUBA', 'HORTOLANDIA'
  )
ORDER BY score_conversao_0_100 DESC, ticket_estimado_brl DESC
LIMIT 500;

-- VIEW 6: Mercado total endereçável — pitch comercial Brasil
CREATE OR REPLACE VIEW `tbr_leads_prev.v_tam_brasil` AS
SELECT
  uf,
  COUNT(*) AS leads_12m,
  COUNTIF(score_pre >= 75) AS leads_qualificados,
  -- Premissa: ticket médio R$8k, conversão 10% top-tier
  ROUND(COUNTIF(score_pre >= 75) * 0.10 * 8000, 0) AS gmv_potencial_brl
FROM `tbr_leads_prev.leads_brasil_base`
GROUP BY uf
ORDER BY gmv_potencial_brl DESC;
