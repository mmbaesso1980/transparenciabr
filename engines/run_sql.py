import os
import sys
from pathlib import Path

from google.cloud import bigquery
from google.api_core.exceptions import GoogleAPIError

from lib.project_config import gcp_project_id

# ==============================================================================
# PROTOCOLO A.S.M.O.D.E.U.S. - ENGINE DE EXECUÇÃO SQL (BIGQUERY)
# Otimização agressiva de cache e telemetria de custos ativados.
# ==============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]


def init_client():
    """Inicializa o cliente BigQuery de forma segura."""
    try:
        # Utiliza Application Default Credentials do ambiente local ou Service Account
        return bigquery.Client(project=gcp_project_id())
    except Exception as e:
        print("[ERRO] Falha de autenticação BigQuery. Configure ADC ou GOOGLE_APPLICATION_CREDENTIALS.")
        print(f"Detalhes: {e}")
        sys.exit(1)

def run_sql_file(filepath: str, *, client: "bigquery.Client") -> bool:
    """
    Lê e executa um arquivo SQL no BigQuery.
    Força o uso de cache para garantir Custo Zero em reexecuções de DDLs idênticos.
    """
    p = Path(filepath)
    if not p.is_file():
        p = REPO_ROOT / filepath
    if not p.is_file():
        print(f"[ERRO] Arquivo não encontrado -> {filepath}")
        return False

    with open(p, "r", encoding="utf-8") as f:
        query = f.read()
    
    print(f"\n[RUN] {filepath}")
    
    # CONFIGURAÇÃO DE OTMIZAÇÃO: O uso de cache é obrigatório.
    job_config = bigquery.QueryJobConfig(use_query_cache=True)
    
    try:
        # Submete o Job ao BigQuery
        query_job = client.query(query, job_config=job_config)
        
        # Bloqueia a thread até o BigQuery confirmar a conclusão da operação
        query_job.result() 
        
        # Telemetria Forense e Financeira
        bytes_billed = query_job.total_bytes_billed or 0
        mb_billed = bytes_billed / (1024 * 1024)
        cache_status = "ATIVADO (CUSTO $0)" if query_job.cache_hit else "PROCESSADO"
        
        print(f"[OK] {filepath}")
        print(f"     Cache: {cache_status}")
        print(f"     Fat. MB: {mb_billed:.2f}")
        return True
        
    except GoogleAPIError as e:
        print(f"[ERRO API] {filepath}:\n{e}")
        return False
    except Exception as e:
        print(f"[ERRO] {filepath}:\n{e}")
        return False

if __name__ == "__main__":
    client = init_client()
    # ORDEM DE EXECUÇÃO ESTRITA
    # Não altere a ordem. Views estatísticas dependem das tabelas core.
    pipeline_scripts = [
        "sql/ddl_transparenciabr_core.sql",  # 1. Tabelas base (despesas / staging)
        "sql/ddl_predictive_motor.sql",      # 2. TCU / emendas / contratos (predição)
        "sql/ddl_commercial_intel.sql",      # 2b. Orçamento federal LOA / PCA PNCP
        "sql/vw_ceap_zscore_roll.sql",       # 3. Estatística de desvios
        "sql/benford_audit.sql",             # 4. Benford
        "sql/vw_indicadores_municipais.sql",  # 5. Base dos Dados — municípios
        "sql/vw_oportunidades_mercado.sql",    # 5b. Caixa municipal × PCA (BI fornecedor)
        "sql/vw_correlacao_gastos_idh.sql",  # 6. CEAP × IDH (via vw_indicadores)
        "sql/vw_parlamentar_base_eleitoral.sql",  # 7. CEAP × indicadores
        "sql/vw_alerta_emenda_irregular.sql",  # 8. Motor preditivo — alerta crítico
        "sql/vw_alertas_bodes_export.sql",  # 9. Export Firestore
    ]
    
    print("=== INICIANDO PIPELINE DE AUDITORIA (TRANSPARENCIABR) ===")
    
    for script in pipeline_scripts:
        success = run_sql_file(script, client=client)
        if not success:
            print(f"\n[STOP] Falha em: {script}")
            sys.exit(1) # Sai com erro para que ferramentas de CI/CD não continuem o deploy
            
    print("\n=== PIPELINE CONCLUÍDO COM SUCESSO ===")