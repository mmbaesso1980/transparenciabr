import os
from google.cloud import bigquery

project = "transparenciabr"
client = bigquery.Client(project=project)

def run_script(filepath):
    with open(filepath, "r") as f:
        query = f.read()
    print(f"Running {filepath}...")
    try:
        job = client.query(query)
        job.result()
        print(f"Success: {filepath}")
    except Exception as e:
        print(f"Error running {filepath}: {e}")

if __name__ == "__main__":
    run_script("sql/ddl_transparenciabr_core.sql")
    run_script("sql/vw_ceap_zscore_roll.sql")
    run_script("sql/benford_audit.sql")
    run_script("sql/vw_alertas_bodes_export.sql")
