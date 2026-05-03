#!/usr/bin/env python3
"""
Trilho 1 — Carrega 9.6M leads Brasil no BigQuery + cria views.
Sem L4, sem Gemma, só pandas + BQ. ~15min execução.

Output:
  - tbr_leads_prev.leads_brasil_geral (9.6M linhas, dados crus INSS)
  - tbr_leads_prev.leads_qualificaveis (view, filtro determinístico)
  - tbr_leads_prev.leads_carpes_regiao (view, UF=SP cidades Marco)
  - tbr_leads_prev.v_funil_piramide (view, contagens funil)
"""
import os, sys, glob, time, logging
import pandas as pd
from google.cloud import bigquery
from google.cloud.exceptions import NotFound

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
log = logging.getLogger(__name__)

PROJECT = "transparenciabr"
DATASET = "tbr_leads_prev"
LOCATION = "southamerica-east1"
XLSX_DIR = "/home/manusalt13/leads_prev_marco"
TABLE_GERAL = f"{PROJECT}.{DATASET}.leads_brasil_geral"

client = bigquery.Client(project=PROJECT, location=LOCATION)


def ensure_dataset():
    ds_id = f"{PROJECT}.{DATASET}"
    try:
        client.get_dataset(ds_id)
        log.info(f"✅ Dataset {ds_id} já existe")
    except NotFound:
        ds = bigquery.Dataset(ds_id)
        ds.location = LOCATION
        client.create_dataset(ds)
        log.info(f"✅ Dataset {ds_id} criado em {LOCATION}")


def load_xlsx_to_dataframe():
    log.info(f"📁 Lendo XLSX de {XLSX_DIR}")
    files = sorted(glob.glob(f"{XLSX_DIR}/Beneficios_Indeferidos*.xlsx"))
    log.info(f"📊 {len(files)} arquivos encontrados")
    
    dfs = []
    for f in files:
        try:
            mes_label = os.path.basename(f).replace('Beneficios_Indeferidos_', '').replace('.xlsx', '')
            log.info(f"  📖 {os.path.basename(f)}...")
            df = pd.read_excel(f, engine='openpyxl')
            # Normaliza colunas (lowercase, sem espaços)
            df.columns = [c.strip().lower().replace(' ', '_').replace('-', '_') for c in df.columns]
            df['_mes_origem'] = mes_label
            dfs.append(df)
            log.info(f"     → {len(df):,} linhas, {len(df.columns)} cols")
        except Exception as e:
            log.error(f"  ❌ {f}: {e}")
    
    log.info("🔗 Concatenando...")
    full = pd.concat(dfs, ignore_index=True, sort=False)
    log.info(f"✅ Total: {len(full):,} linhas, {len(full.columns)} cols")
    
    # Cast tudo pra string pra evitar problema de schema misto entre meses
    for col in full.columns:
        if col != '_mes_origem':
            full[col] = full[col].astype(str)
    
    return full


def upload_to_bq(df):
    log.info(f"☁️  Carregando {len(df):,} linhas → {TABLE_GERAL}")
    job_config = bigquery.LoadJobConfig(
        write_disposition="WRITE_TRUNCATE",
        autodetect=True,
    )
    t0 = time.time()
    job = client.load_table_from_dataframe(df, TABLE_GERAL, job_config=job_config)
    job.result()
    log.info(f"✅ Upload concluído em {time.time()-t0:.0f}s")
    
    table = client.get_table(TABLE_GERAL)
    log.info(f"📊 Tabela: {table.num_rows:,} linhas, {len(table.schema)} cols")


def create_views(df_columns):
    """Cria views baseadas em colunas reais detectadas."""
    log.info("🔍 Detectando colunas relevantes...")
    cols = set(df_columns)
    
    # Heurísticas pra achar colunas (INSS varia)
    col_uf = next((c for c in cols if 'uf' in c.lower()), None)
    col_municipio = next((c for c in cols if 'munic' in c.lower() or 'cidade' in c.lower()), None)
    col_motivo = next((c for c in cols if 'motivo' in c.lower() or 'despacho' in c.lower()), None)
    col_idade = next((c for c in cols if 'idade' in c.lower() or 'nascimento' in c.lower() or 'dt_nasc' in c.lower()), None)
    col_especie = next((c for c in cols if 'espec' in c.lower() or 'beneficio' in c.lower()), None)
    
    log.info(f"  UF: {col_uf} | Município: {col_municipio} | Motivo: {col_motivo} | Idade: {col_idade} | Espécie: {col_especie}")
    
    # View qualificáveis (filtro determinístico)
    where_qualif = []
    if col_motivo:
        where_qualif.append(f"LOWER({col_motivo}) LIKE '%incapacidade%' OR LOWER({col_motivo}) LIKE '%pericia%' OR LOWER({col_motivo}) LIKE '%constata%'")
    where_qualif_sql = "(" + " OR ".join(where_qualif) + ")" if where_qualif else "1=1"
    
    sql_qualif = f"""
    CREATE OR REPLACE VIEW `{PROJECT}.{DATASET}.leads_qualificaveis` AS
    SELECT *
    FROM `{TABLE_GERAL}`
    WHERE {where_qualif_sql}
    """
    log.info("📋 Criando view leads_qualificaveis...")
    client.query(sql_qualif).result()
    
    # View Carpes região (Pirassununga + Valinhos + RM)
    if col_uf and col_municipio:
        sql_carpes = f"""
        CREATE OR REPLACE VIEW `{PROJECT}.{DATASET}.leads_carpes_regiao` AS
        SELECT *
        FROM `{TABLE_GERAL}`
        WHERE UPPER({col_uf}) = 'SP'
          AND (
            UPPER({col_municipio}) LIKE '%PIRASSUNUNGA%' OR
            UPPER({col_municipio}) LIKE '%VALINHOS%' OR
            UPPER({col_municipio}) LIKE '%CAMPINAS%' OR
            UPPER({col_municipio}) LIKE '%LIMEIRA%' OR
            UPPER({col_municipio}) LIKE '%PIRACICABA%' OR
            UPPER({col_municipio}) LIKE '%RIO CLARO%' OR
            UPPER({col_municipio}) LIKE '%MOGI%' OR
            UPPER({col_municipio}) LIKE '%LEME%' OR
            UPPER({col_municipio}) LIKE '%ARARAS%' OR
            UPPER({col_municipio}) LIKE '%SAO CARLOS%'
          )
        """
        log.info("📋 Criando view leads_carpes_regiao...")
        client.query(sql_carpes).result()
    
    # Funil pirâmide
    sql_funil = f"""
    CREATE OR REPLACE VIEW `{PROJECT}.{DATASET}.v_funil_piramide` AS
    SELECT
      'Brasil Geral' AS tier, 1 AS ordem, COUNT(*) AS total
      FROM `{TABLE_GERAL}`
    UNION ALL
    SELECT
      'Qualificáveis (filtro determinístico)' AS tier, 2 AS ordem, COUNT(*) AS total
      FROM `{PROJECT}.{DATASET}.leads_qualificaveis`
    """
    if col_uf and col_municipio:
        sql_funil += f"""
    UNION ALL
    SELECT
      'Região Carpes (SP interior)' AS tier, 3 AS ordem, COUNT(*) AS total
      FROM `{PROJECT}.{DATASET}.leads_carpes_regiao`
    """
    sql_funil += "ORDER BY ordem"
    log.info("📋 Criando view v_funil_piramide...")
    client.query(sql_funil).result()
    
    # Top municípios
    if col_municipio and col_uf:
        sql_top = f"""
        CREATE OR REPLACE VIEW `{PROJECT}.{DATASET}.v_top_municipios` AS
        SELECT
          {col_uf} AS uf,
          {col_municipio} AS municipio,
          COUNT(*) AS leads
        FROM `{TABLE_GERAL}`
        WHERE {col_uf} IS NOT NULL AND {col_municipio} IS NOT NULL
        GROUP BY 1, 2
        ORDER BY leads DESC
        LIMIT 100
        """
        log.info("📋 Criando view v_top_municipios...")
        client.query(sql_top).result()
    
    log.info("✅ Views criadas")


def show_results():
    log.info("\n" + "="*60)
    log.info("📊 RESULTADOS")
    log.info("="*60)
    
    sql_funil = f"SELECT tier, total FROM `{PROJECT}.{DATASET}.v_funil_piramide` ORDER BY ordem"
    for row in client.query(sql_funil).result():
        log.info(f"  {row.tier}: {row.total:,}")
    
    log.info("\n🔗 BigQuery Console:")
    log.info(f"  https://console.cloud.google.com/bigquery?project={PROJECT}&p={PROJECT}&d={DATASET}&page=dataset")


def main():
    t0 = time.time()
    log.info("=" * 60)
    log.info("TRILHO 1 — LOAD BRASIL BQ + VIEWS DEMO MARCO")
    log.info("=" * 60)
    
    ensure_dataset()
    df = load_xlsx_to_dataframe()
    upload_to_bq(df)
    create_views(df.columns)
    show_results()
    
    log.info(f"\n⏱️  Total: {(time.time()-t0)/60:.1f} min")
    log.info("✅ TRILHO 1 COMPLETO — dados prontos pra demo Marco")


if __name__ == "__main__":
    main()
