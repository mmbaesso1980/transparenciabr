
import requests
import json
import os
import time

# Constantes da Missão
DATAJUD_API_KEY = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
DATAJUD_API_URL = "https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search"
LEADS_FILE_PATH = os.environ.get("LEADS_FILE", "leads_campinas_50.csv") # A ser criado na VM
DRY_RUN = os.environ.get("DRY_RUN", "1") == "1"

def get_lead_data():
    """
    Função mock para simular a leitura do CSV.
    O arquivo será criado na VM em um passo posterior.
    """
    # Dados extraídos do briefing da missão
    return [
        {"rank": 1, "nome_completo": "MARIA APARECIDA DE SOUZA", "numero_cnj": "5001234-56.2023.4.03.6105"},
        # ... Adicionar os outros 49 leads aqui ...
        # Por simplicidade, vamos operar em um subconjunto para o DRY RUN
        {"rank": 2, "nome_completo": "JOAO SILVA", "numero_cnj": "5009876-54.2022.4.03.6105"},
        {"rank": 3, "nome_completo": "JOSE PEREIRA", "numero_cnj": "0000000-00.0000.4.03.0000"}, # Exemplo de falha
    ]

def query_datajud(cnj):
    headers = {
        "Authorization": f"APIKey {DATAJUD_API_KEY}",
        "Content-Type": "application/json",
    }
    query = {
        "query": {
            "bool": {
                "must": [
                    {"match": {"numeroProcesso": cnj}}
                ]
            }
        }
    }
    try:
        response = requests.post(DATAJUD_API_URL, headers=headers, json=query, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"[ERRO] Falha ao consultar Datajud para CNJ {cnj}: {e}")
        return None

def extract_cpf(datajud_response):
    """Extrai o CPF do polo ativo."""
    try:
        hits = datajud_response["hits"]["hits"]
        if not hits:
            return None, "sem_hit_processo"
        
        partes = hits[0]["_source"].get("partes")
        if not partes:
            return None, "sem_campo_partes"

        for parte in partes:
            if parte.get("polo") == "ATIVO":
                documento = parte.get("documento")
                if documento and len(documento) >= 11: # Validação simples
                    # TODO: Adicionar validação de dígito verificador
                    return documento, "sucesso_pje_trf3"
        
        return None, "sem_polo_ativo_com_cpf"
    except (KeyError, IndexError) as e:
        print(f"[ERRO] Estrutura inesperada na resposta do Datajud: {e}")
        return None, "erro_parsing_json"

def main():
    print("--- INICIANDO ENRIQUECIMENTO (DRY_RUN) ---")
    leads = get_lead_data()
    
    hits_pje = 0
    misses_pje = 0
    
    print(f"Processando {len(leads)} leads.")

    for lead in leads:
        cnj = lead["numero_cnj"]
        print(f"Consultando CNJ: {cnj}...")
        
        if DRY_RUN:
            # Em DRY_RUN, apenas simulamos a chamada e o resultado
            if "0000000" in cnj: # Simula falha
                print(f"  -> [DRY_RUN] Simulado: MISS (CNJ inválido)")
                misses_pje += 1
            else:
                print(f"  -> [DRY_RUN] Simulado: HIT")
                hits_pje += 1
        else:
            # Lógica de execução real (a ser implementada)
            pass
        
        time.sleep(1) # Respeitar o rate limit implícito

    print("\n--- RESULTADO DRY_RUN ---")
    print(f"Total de leads processados: {len(leads)}")
    print(f"Hits potenciais no PJe/TRF3 (Caminho 1): {hits_pje}")
    print(f"Misses / Fallbacks para Direct Data: {misses_pje}")
    print("--------------------------")
    print("Aguardando comando '/maestro continuar' para executar o enriquecimento pago (Caminho 2).")


if __name__ == "__main__":
    main()
