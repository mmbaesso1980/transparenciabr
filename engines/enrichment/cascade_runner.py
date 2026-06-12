'''
# TransparênciaBR - AURORA Enrichment Pipeline (Maestro Autônomo)
# Mission: Campinas-50 PII Enrichment
# Runner: cascade_runner.py v1.0 (Dry Run)
'''
import pandas as pd
import requests
import base64
import os
import json
import time

# --- CONFIG --- #
LEADS_CSV_PATH = "/home/manusalt13/leads_campinas_50.csv"
DATAJUD_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
DATAJUD_ENDPOINT = "https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search"
USER_AGENT = "TransparenciaBR-engines/1.0"

DRY_RUN = os.environ.get("DRY_RUN", "1") == "1"

def get_cpf_from_datajud(cnj: str) -> str | None:
    '''Consulta o Datajud para extrair o CPF do polo ativo.'''
    headers = {
        "Authorization": f"APIKey {DATAJUD_API_KEY}",
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json"
    }
    query = {
        "query": {
            "match": {
                "numeroProcesso": cnj
            }
        }
    }
    try:
        response = requests.post(DATAJUD_ENDPOINT, headers=headers, json=query, timeout=20)
        response.raise_for_status() # Lança exceção para 4xx/5xx

        data = response.json()
        if not data.get("hits", {}).get("hits"):
            return None

        # Extrai CPF do primeiro resultado, polo ativo
        partes = data["hits"]["hits"][0]["_source"].get("partes", [])
        for parte in partes:
            if parte.get("tipo") == "polo_ativo":
                documento = parte.get("documento")
                # Validação simples de formato
                if documento and len(str(documento)) == 11 and str(documento).isdigit():
                    return str(documento)
        return None

    except requests.exceptions.RequestException as e:
        print(f"[AVISO] Erro ao consultar CNJ {cnj}: {e}")
        return None

def main():
    '''Executa o pipeline de enriquecimento.'''
    print("--- INICIANDO ENRIQUECIMENTO CAMPINAS-50 ---")
    print(f"Modo DRY_RUN: {DRY_RUN}")

    try:
        df = pd.read_csv(LEADS_CSV_PATH)
        print(f"Arquivo {LEADS_CSV_PATH} lido com sucesso. Total de leads: {len(df)}")
    except FileNotFoundError:
        print(f"[ERRO CRÍTICO] Arquivo de leads não encontrado em: {LEADS_CSV_PATH}")
        return

    hits_pje = 0
    total_leads = len(df)

    for index, row in df.iterrows():
        cnj = row["numero_cnj"]
        print(f"Processando lead {index + 1}/{total_leads} (CNJ: {cnj})...")
        
        cpf = get_cpf_from_datajud(cnj)
        
        if cpf:
            hits_pje += 1
            print(f"  -> HIT no Datajud! CPF encontrado para o CNJ {cnj}.")
        else:
            print(f"  -> MISS no Datajud para o CNJ {cnj}.")
        
        # Pausa para não sobrecarregar a API
        time.sleep(1)

    print("\n--- RESULTADO DO DRY RUN ---")
    print(f"Total de leads processados: {total_leads}")
    print(f"Sucessos na busca via PJe/Datajud (Caminho 1): {hits_pje}")
    print(f"Leads que necessitarão de busca via Direct Data (Caminho 2): {total_leads - hits_pje}")
    print("--------------------------\n")
    print("Aguardando confirmação do Comandante para proceder com a fase de queima de crédito (Direct Data).")

if __name__ == "__main__":
    main()
