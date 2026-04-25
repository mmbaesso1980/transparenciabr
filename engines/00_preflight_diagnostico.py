import os
import requests
from google.cloud import bigquery

def run_preflight():
    print("=== INICIANDO PREFLIGHT DIAGNOSTICO ===")

    try:
        client = bigquery.Client()
        dataset_id = f"{client.project}.transparenciabr"
        tables = list(client.list_tables(dataset_id))
        print(f" OK - Encontradas {len(tables)} tabelas/views no dataset {dataset_id}")
    except Exception as e:
        print(f" ERRO de conectividade: {e}")

    cgu_token = os.environ.get("CGU_API_TOKEN")
    url = "https://api.portaldatransparencia.gov.br/api-de-dados/emendas?ano=2024&pagina=1"
    headers = {"chave-api-dados": cgu_token} if cgu_token else {}

    try:
        resp = requests.get(url, headers=headers, timeout=10)
        print(f"[API CGU] Status: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            if len(data) > 0:
                print(f"[API CGU] Sucesso. Chaves no payload: {list(data[0].keys())}")
            else:
                print("[API CGU] Aviso: API respondeu 200, mas retornou array vazio.")
    except Exception as e:
        print(f"[API CGU] ERRO de requisição: {e}")

    print("=== PREFLIGHT CONCLUÍDO ===")
    exit(0)

if __name__ == "__main__":
    run_preflight()
