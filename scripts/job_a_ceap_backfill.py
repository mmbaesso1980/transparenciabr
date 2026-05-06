#!/usr/bin/env python3
"""
JOB A — CEAP Backfill 2019-2022 (legislatura 56)
================================================
Baixa cota parlamentar Camara para anos faltantes, salva em BQ.
Idempotente: SKIP se ano ja indexado.
Rate limit: 8 req/s (margem segura, API aceita 10).

Run: python3 job_a_ceap_backfill.py
ENV: BQ_PROJECT=transparenciabr
Tempo: ~6-8h (legislatura 56 ~600k notas)
Custo: R$ 0 (BQ insert) + ~R$ 30 (Vertex import depois)
"""
import os, sys, json, time, hashlib, logging
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO, format='%(asctime)s [JOB-A] %(message)s')
log = logging.getLogger()

BQ_PROJECT = os.getenv('BQ_PROJECT', 'transparenciabr')
BQ_DATASET = 'transparenciabr'
BQ_TABLE = 'ceap_despesas'
ANOS = [2019, 2020, 2021, 2022]
RATE_SLEEP = 0.13  # 8 req/s
API_BASE = 'https://dadosabertos.camara.leg.br/api/v2'
CHECKPOINT = '/tmp/aurora_job_a_checkpoint.json'

bq = bigquery.Client(project=BQ_PROJECT)

def load_checkpoint():
    if os.path.exists(CHECKPOINT):
        return json.load(open(CHECKPOINT))
    return {'processed_keys': []}

def save_checkpoint(cp):
    json.dump(cp, open(CHECKPOINT, 'w'))

def get_deputados_legislatura(legislatura):
    deputados = []
    pagina = 1
    while True:
        r = requests.get(f'{API_BASE}/deputados', params={
            'idLegislatura': legislatura, 'pagina': pagina, 'itens': 100
        }, timeout=30)
        r.raise_for_status()
        dados = r.json().get('dados', [])
        if not dados: break
        deputados.extend(dados)
        pagina += 1
        time.sleep(RATE_SLEEP)
    log.info(f'Legislatura {legislatura}: {len(deputados)} deputados')
    return deputados

def get_despesas_dep_ano(dep_id, ano):
    despesas = []
    pagina = 1
    while True:
        try:
            r = requests.get(f'{API_BASE}/deputados/{dep_id}/despesas', params={
                'ano': ano, 'pagina': pagina, 'itens': 100, 'ordem': 'ASC',
                'ordenarPor': 'numDocumento'
            }, timeout=30)
            if r.status_code == 429:
                time.sleep(5); continue
            r.raise_for_status()
            dados = r.json().get('dados', [])
            if not dados: break
            despesas.extend(dados)
            pagina += 1
            time.sleep(RATE_SLEEP)
        except Exception as e:
            log.warning(f'dep={dep_id} ano={ano} pag={pagina} erro={e}')
            break
    return despesas

def normalize_despesa(d, dep_id, dep_nome, ano):
    return {
        'parlamentar_id': str(dep_id),
        'autor': dep_nome,
        'ano': ano,
        'mes': d.get('mes'),
        'data_emissao': d.get('dataDocumento'),
        'tipo_despesa': d.get('tipoDespesa'),
        'cod_documento': str(d.get('codDocumento','')),
        'tipo_documento': d.get('tipoDocumento'),
        'num_documento': d.get('numDocumento'),
        'valor_documento': float(d.get('valorDocumento') or 0),
        'valor_glosa': float(d.get('valorGlosa') or 0),
        'valor_liquido': float(d.get('valorLiquido') or 0),
        'fornecedor': d.get('nomeFornecedor'),
        'cnpj_cpf_fornecedor': d.get('cnpjCpfFornecedor'),
        'url_documento': d.get('urlDocumento'),
        'codigo_ibge_municipio': None,  # CEAP nao traz, populamos depois cruzando com Querido Diario
        'ingest_batch': 'aurora_2026_05_05',
        'fetched_at': datetime.utcnow().isoformat(),
    }

def insert_batch(rows):
    if not rows: return
    table = f'{BQ_PROJECT}.{BQ_DATASET}.{BQ_TABLE}'
    errors = bq.insert_rows_json(table, rows)
    if errors:
        log.error(f'BQ insert erros: {errors[:3]}')

def process_dep_ano(dep, ano, cp):
    dep_id = dep['id']
    dep_nome = dep['nome']
    key = f'{dep_id}_{ano}'
    if key in cp['processed_keys']:
        return 0
    despesas = get_despesas_dep_ano(dep_id, ano)
    rows = [normalize_despesa(d, dep_id, dep_nome, ano) for d in despesas]
    insert_batch(rows)
    cp['processed_keys'].append(key)
    save_checkpoint(cp)
    return len(rows)

def main():
    log.info('=== JOB A INICIADO ===')
    cp = load_checkpoint()
    log.info(f'Checkpoint: {len(cp["processed_keys"])} (dep,ano) ja processados')

    # Legislatura 56 = 2019-2022
    deputados_56 = get_deputados_legislatura(56)

    total_inserted = 0
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = []
        for dep in deputados_56:
            for ano in ANOS:
                futures.append(pool.submit(process_dep_ano, dep, ano, cp))
        for i, fut in enumerate(as_completed(futures)):
            try:
                n = fut.result()
                total_inserted += n
                if i % 50 == 0:
                    log.info(f'Progresso: {i}/{len(futures)} | total inserido={total_inserted}')
            except Exception as e:
                log.error(f'Future erro: {e}')

    log.info(f'=== JOB A FINALIZADO === Total: {total_inserted} despesas inseridas')

if __name__ == '__main__':
    main()
