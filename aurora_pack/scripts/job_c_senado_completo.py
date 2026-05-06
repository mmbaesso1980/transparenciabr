#!/usr/bin/env python3
"""
JOB C — Senado Completo (Senadores + CEAPS + Votacoes + Discursos + Comissoes)
==============================================================================
Senado nao usa CEAP, usa CEAPS (Cota para Exercicio da Atividade Parlamentar dos Senadores).

APIs DadosAbertos Senado: https://legis.senado.leg.br/dadosabertos/
- Senadores em exercicio: /senador/lista/atual
- Senadores historicos: /senador/lista/legislatura/{legislatura}
- CEAPS: /senador/{cod}/despesas/{ano}
- Votacoes: /plenario/lista/votacao/{ano}
- Discursos: /senador/{cod}/discursos

Tempo: ~10-12h
Custo: R$ 0 (APIs publicas) + ~R$ 200 Vertex import
"""
import os, time, logging, json, hashlib
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests, xmltodict
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO, format='%(asctime)s [JOB-C] %(message)s')
log = logging.getLogger()

BQ_PROJECT = os.getenv('BQ_PROJECT', 'transparenciabr')
bq = bigquery.Client(project=BQ_PROJECT)

API = 'https://legis.senado.leg.br/dadosabertos'
HEADERS = {'Accept': 'application/json'}
ANOS = list(range(2018, 2027))
RATE = 0.2  # 5 req/s

def get(path, **params):
    for tentativa in range(3):
        try:
            r = requests.get(f'{API}{path}', params=params, headers=HEADERS, timeout=30)
            if r.status_code == 200:
                return r.json()
            if r.status_code == 429:
                time.sleep(5); continue
            return None
        except Exception as e:
            log.warning(f'GET {path} erro={e}')
            time.sleep(2)
    return None

def get_senadores_legislatura(leg):
    data = get(f'/senador/lista/legislatura/{leg}')
    if not data: return []
    sens = data.get('ListaParlamentarLegislatura',{}).get('Parlamentares',{}).get('Parlamentar',[])
    if isinstance(sens, dict): sens = [sens]
    return sens

def get_ceaps(cod_senador, ano):
    data = get(f'/senador/{cod_senador}/despesas/{ano}')
    if not data: return []
    desps = data.get('DespesasParlamentar',{}).get('Despesas',{}).get('Despesa',[])
    if isinstance(desps, dict): desps = [desps]
    return desps

def normalize_ceaps(d, cod, nome, ano):
    return {
        'parlamentar_id': f'SEN_{cod}',
        'autor': nome,
        'casa': 'SENADO',
        'ano': ano,
        'mes': d.get('Mes'),
        'data_emissao': d.get('DataDocumento'),
        'tipo_despesa': d.get('TipoDespesa'),
        'cod_documento': d.get('CodigoDocumento',''),
        'fornecedor': d.get('Fornecedor'),
        'cnpj_cpf_fornecedor': d.get('CpfCnpjFornecedor'),
        'valor_documento': float(d.get('Valor') or 0),
        'valor_reembolsado': float(d.get('ValorReembolsado') or 0),
        'detalhamento': d.get('Detalhamento'),
        'ingest_batch': 'aurora_senado_2026_05_05',
        'fetched_at': datetime.utcnow().isoformat(),
    }

def get_votacoes_ano(ano):
    data = get(f'/plenario/lista/votacao/{ano}')
    if not data: return []
    vots = data.get('VotacaoPlenario',{}).get('Votacoes',{}).get('Votacao',[])
    if isinstance(vots, dict): vots = [vots]
    return vots

def get_discursos_senador(cod):
    data = get(f'/senador/{cod}/discursos')
    if not data: return []
    discs = data.get('DiscursosParlamentar',{}).get('Pronunciamentos',{}).get('Pronunciamento',[])
    if isinstance(discs, dict): discs = [discs]
    return discs

def main():
    log.info('=== JOB C INICIADO ===')
    
    # 1. Cria tabelas se nao existem
    schemas = {
        'senadores': """CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.senadores` (
            cod_senador STRING, nome STRING, partido STRING, uf STRING,
            legislatura INT64, em_exercicio BOOL, foto_url STRING,
            ingest_batch STRING, fetched_at TIMESTAMP)""",
        'senado_ceaps': """CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.senado_ceaps` (
            parlamentar_id STRING, autor STRING, casa STRING, ano INT64, mes INT64,
            data_emissao STRING, tipo_despesa STRING, cod_documento STRING,
            fornecedor STRING, cnpj_cpf_fornecedor STRING, valor_documento FLOAT64,
            valor_reembolsado FLOAT64, detalhamento STRING,
            ingest_batch STRING, fetched_at TIMESTAMP)""",
        'senado_votacoes': """CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.senado_votacoes` (
            cod_votacao STRING, ano INT64, data DATE, materia STRING, resultado STRING,
            descricao STRING, ingest_batch STRING, fetched_at TIMESTAMP)""",
        'senado_discursos': """CREATE TABLE IF NOT EXISTS `transparenciabr.transparenciabr.senado_discursos` (
            cod_discurso STRING, cod_senador STRING, senador_nome STRING,
            data DATE, sessao STRING, indexacao STRING, sumario STRING,
            url_texto STRING, ingest_batch STRING, fetched_at TIMESTAMP)""",
    }
    for name, sql in schemas.items():
        bq.query(sql).result()
        log.info(f'Schema {name} OK')
    
    # 2. Senadores legislaturas 56 (2019-2022) e 57 (2023-2026)
    todos_senadores = {}
    for leg in [56, 57]:
        sens = get_senadores_legislatura(leg)
        for s in sens:
            ident = s.get('IdentificacaoParlamentar', {})
            cod = ident.get('CodigoParlamentar')
            if not cod: continue
            todos_senadores[cod] = {
                'cod_senador': cod,
                'nome': ident.get('NomeParlamentar', ''),
                'partido': ident.get('SiglaPartidoParlamentar', ''),
                'uf': ident.get('UfParlamentar', ''),
                'legislatura': leg,
                'em_exercicio': leg == 57,
                'foto_url': ident.get('UrlFotoParlamentar', ''),
                'ingest_batch': 'aurora_2026_05_05',
                'fetched_at': datetime.utcnow().isoformat(),
            }
        time.sleep(RATE)
    log.info(f'{len(todos_senadores)} senadores unicos coletados')
    bq.insert_rows_json('transparenciabr.transparenciabr.senadores', list(todos_senadores.values()))
    
    # 3. CEAPS por senador x ano (paralelo)
    log.info('Ingesting CEAPS...')
    total_ceaps = 0
    def proc_ceaps(cod, nome, ano):
        rows = [normalize_ceaps(d, cod, nome, ano) for d in get_ceaps(cod, ano)]
        if rows:
            bq.insert_rows_json('transparenciabr.transparenciabr.senado_ceaps', rows)
        return len(rows)
    
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = []
        for cod, dados in todos_senadores.items():
            for ano in ANOS:
                futs.append(pool.submit(proc_ceaps, cod, dados['nome'], ano))
        for i, fut in enumerate(as_completed(futs)):
            total_ceaps += fut.result()
            if i % 50 == 0:
                log.info(f'CEAPS: {i}/{len(futs)} total={total_ceaps}')
    log.info(f'CEAPS total: {total_ceaps}')
    
    # 4. Votacoes por ano
    log.info('Ingesting votacoes...')
    for ano in ANOS:
        vots = get_votacoes_ano(ano)
        rows = [{
            'cod_votacao': str(v.get('CodigoSessaoVotacao','')),
            'ano': ano,
            'data': v.get('DataSessao'),
            'materia': str(v.get('Materia',{}).get('SiglaTipoMateria',''))+' '+str(v.get('Materia',{}).get('NumeroMateria','')),
            'resultado': v.get('Resultado',''),
            'descricao': v.get('DescricaoVotacao',''),
            'ingest_batch': 'aurora_2026_05_05',
            'fetched_at': datetime.utcnow().isoformat(),
        } for v in vots]
        if rows:
            bq.insert_rows_json('transparenciabr.transparenciabr.senado_votacoes', rows)
        log.info(f'Votacoes {ano}: {len(rows)}')
        time.sleep(RATE)
    
    # 5. Discursos (so legislatura atual pra caber no tempo)
    log.info('Ingesting discursos legislatura 57...')
    sens_atuais = [c for c, d in todos_senadores.items() if d['em_exercicio']]
    def proc_disc(cod):
        nome = todos_senadores[cod]['nome']
        discs = get_discursos_senador(cod)
        rows = [{
            'cod_discurso': str(d.get('CodigoPronunciamento','')),
            'cod_senador': cod, 'senador_nome': nome,
            'data': d.get('DataPronunciamento'),
            'sessao': d.get('SessaoPlenaria',{}).get('SiglaCasaSessao',''),
            'indexacao': d.get('Indexacao',''),
            'sumario': d.get('TextoResumo','') or d.get('TextoIndexacao',''),
            'url_texto': d.get('UrlTexto',''),
            'ingest_batch': 'aurora_2026_05_05',
            'fetched_at': datetime.utcnow().isoformat(),
        } for d in discs]
        if rows:
            bq.insert_rows_json('transparenciabr.transparenciabr.senado_discursos', rows)
        return len(rows)
    
    with ThreadPoolExecutor(max_workers=4) as pool:
        futs = [pool.submit(proc_disc, c) for c in sens_atuais]
        total_disc = sum(f.result() for f in as_completed(futs))
    log.info(f'Discursos: {total_disc}')
    
    log.info('=== JOB C FINALIZADO ===')

if __name__ == '__main__':
    main()
