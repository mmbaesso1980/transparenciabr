#!/usr/bin/env python3
"""
JOB B — Emendas Autoria Fix
============================
A tabela transparenciabr.emendas tem cpfCnpjAutor = NULL em 100% dos 32k registros.
Sem isso, a promessa "Emendas por Deputado/Senador" e impossivel.

Estrategia:
1. Le tabela emendas atual (32k)
2. Para cada emenda sem autor, consulta SIOP/Camara API por codigoEmenda
3. Cruza com tabela de autores via codigo da emenda
4. UPDATE em batch no BQ

Tempo: ~3-4h
Custo: R$ 0 (queries APIs publicas + UPDATE BQ)
"""
import os, time, logging, requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO, format='%(asctime)s [JOB-B] %(message)s')
log = logging.getLogger()

BQ_PROJECT = os.getenv('BQ_PROJECT', 'transparenciabr')
bq = bigquery.Client(project=BQ_PROJECT)

# API SIOP (Sistema Integrado de Planejamento e Orcamento) - emendas com autor
SIOP_API = 'https://www.siop.planejamento.gov.br/modulo/login/JSON.jsp'

# Estrategia 1: API Camara emendas (tem autor)
# https://dadosabertos.camara.leg.br/api/v2/proposicoes/{id}/autores
# Mas precisa do id da proposicao, nao codigoEmenda

# Estrategia 2: Portal Transparencia API (mais direto)
PT_API = 'https://api.portaldatransparencia.gov.br/api-de-dados/emendas'
# requer header chave-api-dados (gratis com cadastro CGU)
# Comandante: criar conta em https://www.portaldatransparencia.gov.br/api-de-dados/cadastrar-email

PT_KEY = os.getenv('PORTAL_TRANSPARENCIA_KEY', '')

def fetch_emenda_autor(codigo_emenda):
    """Busca autor via Portal Transparencia API."""
    if not PT_KEY:
        return None
    try:
        r = requests.get(PT_API, params={'codigoEmenda': codigo_emenda, 'pagina': 1},
                         headers={'chave-api-dados': PT_KEY}, timeout=15)
        if r.status_code != 200: return None
        dados = r.json()
        if not dados: return None
        autor = dados[0].get('autor', {})
        return {
            'codigoEmenda': codigo_emenda,
            'cpfCnpjAutor': autor.get('cpfCnpj') or autor.get('codigo'),
            'nomeAutor': autor.get('nome') or autor.get('descricao'),
            'tipoAutor': autor.get('tipo'),
        }
    except Exception as e:
        log.warning(f'codigoEmenda={codigo_emenda} erro={e}')
        return None

def main():
    log.info('=== JOB B INICIADO ===')
    if not PT_KEY:
        log.error('PORTAL_TRANSPARENCIA_KEY nao definido. Crie conta em https://www.portaldatransparencia.gov.br/api-de-dados/cadastrar-email')
        log.error('export PORTAL_TRANSPARENCIA_KEY=sua_chave_aqui')
        log.warning('JOB B abortado. Continuando outros jobs.')
        return

    # 1. Pega codigos de emenda sem autor
    sql = """
    SELECT DISTINCT codigoEmenda
    FROM `transparenciabr.transparenciabr.emendas`
    WHERE (cpfCnpjAutor IS NULL OR cpfCnpjAutor = '')
      AND codigoEmenda IS NOT NULL
    """
    codigos = [r.codigoEmenda for r in bq.query(sql).result()]
    log.info(f'{len(codigos)} emendas sem autor para processar')

    # 2. Cria tabela staging
    staging_sql = """
    CREATE OR REPLACE TABLE `transparenciabr.transparenciabr.emendas_autores_fix` (
      codigoEmenda STRING, cpfCnpjAutor STRING, nomeAutor STRING, tipoAutor STRING
    )
    """
    bq.query(staging_sql).result()

    # 3. Fan-out
    rows = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(fetch_emenda_autor, c): c for c in codigos}
        for i, fut in enumerate(as_completed(futures)):
            r = fut.result()
            if r and r.get('cpfCnpjAutor'):
                rows.append(r)
            if i % 200 == 0:
                log.info(f'Progresso: {i}/{len(codigos)} | autores encontrados={len(rows)}')
            if len(rows) >= 1000:
                bq.insert_rows_json('transparenciabr.transparenciabr.emendas_autores_fix', rows)
                rows = []
    if rows:
        bq.insert_rows_json('transparenciabr.transparenciabr.emendas_autores_fix', rows)

    # 4. UPDATE original
    update_sql = """
    UPDATE `transparenciabr.transparenciabr.emendas` e
    SET cpfCnpjAutor = f.cpfCnpjAutor,
        autor = f.nomeAutor
    FROM `transparenciabr.transparenciabr.emendas_autores_fix` f
    WHERE e.codigoEmenda = f.codigoEmenda
      AND (e.cpfCnpjAutor IS NULL OR e.cpfCnpjAutor = '')
    """
    job = bq.query(update_sql); job.result()
    log.info(f'UPDATE concluido: {job.num_dml_affected_rows} linhas')
    log.info('=== JOB B FINALIZADO ===')

if __name__ == '__main__':
    main()
