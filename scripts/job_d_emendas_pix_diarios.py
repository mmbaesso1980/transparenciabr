#!/usr/bin/env python3
"""
JOB D — Emendas PIX × Diarios Oficiais (FLAGS DE OURO)
========================================================
Cruza emendas PIX (transferencia direta) com Querido Diario para detectar:
1. Shows caros em municipios IDH baixo
2. Esculturas/monumentos > orcamento educacao municipal
3. Festas com cache acima da media
4. Contratacoes inexigiveis com mesmo CNPJ recorrente

Saida: tabela `transparenciabr.transparenciabr.flags_emendas_pix`
Tempo: ~4-6h
Custo: R$ 0 (cruza dados que ja temos no Vertex/BQ)
"""
import os, logging, json
from datetime import datetime
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO, format='%(asctime)s [JOB-D] %(message)s')
log = logging.getLogger()

BQ_PROJECT = os.getenv('BQ_PROJECT', 'transparenciabr')
bq = bigquery.Client(project=BQ_PROJECT)

# Keywords suspeitas para flag em diarios oficiais
KEYWORDS = {
    'show_caro': ['contratacao show', 'cache artistico', 'apresentacao musical', 'banda contratada', 'cantor contratado'],
    'escultura': ['escultura', 'monumento', 'busto', 'estatua', 'obra de arte publica'],
    'festa': ['festa popular', 'evento cultural', 'festival', 'micareta', 'arraia'],
    'inexigibilidade_cultural': ['inexigibilidade.*cultur', 'inexigibilidade.*artist', 'inexigibilidade.*show'],
}

def main():
    log.info('=== JOB D INICIADO ===')

    # 1. Cria tabela flags
    bq.query("""
    CREATE OR REPLACE TABLE `transparenciabr.transparenciabr.flags_emendas_pix` (
      flag_id STRING,
      tipo_flag STRING,
      severidade STRING,
      parlamentar_id STRING,
      parlamentar_nome STRING,
      municipio STRING,
      uf STRING,
      codigo_ibge STRING,
      valor_emenda FLOAT64,
      ano INT64,
      idh_municipal FLOAT64,
      orcamento_educacao_municipal FLOAT64,
      razao_emenda_educacao FLOAT64,
      diario_url STRING,
      diario_data STRING,
      trecho_diario STRING,
      keyword_match STRING,
      mensagem_humana STRING,
      criado_em TIMESTAMP
    )
    """).result()
    log.info('Tabela flags_emendas_pix criada')

    # 2. FLAG 1: Show caro em IDH baixo
    log.info('FLAG 1: Shows em IDH baixo...')
    bq.query("""
    INSERT INTO `transparenciabr.transparenciabr.flags_emendas_pix`
    WITH emendas_show AS (
      SELECT
        e.codigoEmenda,
        e.cpfCnpjAutor as parlamentar_id,
        e.autor as parlamentar_nome,
        e.municipio,
        e.estado as uf,
        SAFE_CAST(e.valorLiquidado AS FLOAT64) as valor_emenda,
        e.ano,
        e.descricao
      FROM `transparenciabr.transparenciabr.emendas` e
      WHERE LOWER(e.descricao) LIKE '%show%'
         OR LOWER(e.descricao) LIKE '%musical%'
         OR LOWER(e.descricao) LIKE '%artistic%'
         OR LOWER(e.funcao) = 'cultura'
    ),
    municipios_idh AS (
      SELECT
        nome_municipio, uf, idh_municipal, codigo_ibge
      FROM `transparenciabr.transparenciabr.vw_indicadores_municipais`
      WHERE idh_municipal IS NOT NULL AND idh_municipal < 0.65
    )
    SELECT
      GENERATE_UUID() as flag_id,
      'SHOW_CARO_IDH_BAIXO' as tipo_flag,
      CASE
        WHEN es.valor_emenda > 500000 THEN 'CRITICO'
        WHEN es.valor_emenda > 200000 THEN 'ALTO'
        ELSE 'MEDIO' END as severidade,
      es.parlamentar_id, es.parlamentar_nome,
      es.municipio, es.uf, mi.codigo_ibge,
      es.valor_emenda, es.ano,
      mi.idh_municipal,
      NULL as orcamento_educacao_municipal,
      NULL as razao_emenda_educacao,
      NULL as diario_url, NULL as diario_data, NULL as trecho_diario,
      'show OR musical OR cultura' as keyword_match,
      CONCAT(
        'Emenda de R$ ', FORMAT('%.2f', es.valor_emenda),
        ' destinada a evento cultural em ', es.municipio, '/', es.uf,
        ' (IDH ', FORMAT('%.3f', mi.idh_municipal), ' - abaixo da media nacional). ',
        'Indicio quantitativo derivado de dados publicos. Nao configura ilicito.'
      ) as mensagem_humana,
      CURRENT_TIMESTAMP() as criado_em
    FROM emendas_show es
    JOIN municipios_idh mi
      ON UPPER(TRIM(es.municipio)) = UPPER(TRIM(mi.nome_municipio))
     AND UPPER(es.uf) = UPPER(mi.uf)
    WHERE es.valor_emenda > 50000
    """).result()
    n1 = next(bq.query("SELECT COUNT(*) n FROM `transparenciabr.transparenciabr.flags_emendas_pix` WHERE tipo_flag='SHOW_CARO_IDH_BAIXO'").result()).n
    log.info(f'FLAG 1: {n1} alertas')

    # 3. FLAG 2: Inexigibilidade cultural cruzada com diarios
    log.info('FLAG 2: Inexigibilidade cultural em diarios...')
    bq.query("""
    INSERT INTO `transparenciabr.transparenciabr.flags_emendas_pix`
    WITH diarios_suspeitos AS (
      SELECT
        territory_id as codigo_ibge,
        municipio,
        url_fonte as diario_url,
        data as diario_data,
        trecho_ato as trecho_diario,
        keyword_match,
        politico_id
      FROM `transparenciabr.tbr_ceap.ceap_despesas_ext`  -- placeholder, substituir por export Vertex
      WHERE FALSE  -- desabilitado ate ter export Vertex->BQ
    )
    SELECT
      GENERATE_UUID() as flag_id,
      'INEXIGIBILIDADE_CULTURAL' as tipo_flag,
      'INFORMATIVO' as severidade,
      ds.politico_id as parlamentar_id,
      NULL as parlamentar_nome,
      ds.municipio, NULL as uf, ds.codigo_ibge,
      NULL as valor_emenda, EXTRACT(YEAR FROM PARSE_DATE('%Y-%m-%d', ds.diario_data)) as ano,
      NULL as idh_municipal, NULL as orcamento_educacao_municipal,
      NULL as razao_emenda_educacao,
      ds.diario_url, ds.diario_data, ds.trecho_diario,
      ds.keyword_match,
      CONCAT('Diario oficial registra inexigibilidade em ', ds.municipio,
             ' (', ds.diario_data, '). Trecho relevante extraido para auditoria.') as mensagem_humana,
      CURRENT_TIMESTAMP()
    FROM diarios_suspeitos ds
    """).result()
    log.info('FLAG 2: pulado ate Vertex->BQ export')

    # 4. FLAG 3: Recorrencia de fornecedor (CNPJ) em multiplas emendas mesma cidade
    log.info('FLAG 3: Fornecedor recorrente...')
    # Implementar quando tiver CNPJ fornecedor populado em emendas

    # 5. Estatisticas finais
    stats = next(bq.query("""
    SELECT
      COUNT(*) as total,
      COUNT(DISTINCT parlamentar_id) as parlamentares_flagados,
      COUNT(DISTINCT municipio) as municipios_flagados
    FROM `transparenciabr.transparenciabr.flags_emendas_pix`
    """).result())
    log.info(f'TOTAL FLAGS: {stats.total} | parlamentares={stats.parlamentares_flagados} | municipios={stats.municipios_flagados}')
    log.info('=== JOB D FINALIZADO ===')

if __name__ == '__main__':
    main()
