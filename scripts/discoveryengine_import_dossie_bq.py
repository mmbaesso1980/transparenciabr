#!/usr/bin/env python3
"""
Importa uma tabela BigQuery para um Vertex AI Search / Discovery Engine Data Store.

A tabela de origem usa colunas `id` e `dossie_texto_base`. O formato oficial de
importação `document` exige colunas `id` + `jsonData`; este script cria (ou
atualiza) uma VIEW BigQuery que monta `jsonData` com o texto em `content`,
derivado de `dossie_texto_base`.

Requer ADC (ex.: gcloud auth application-default login) e APIs habilitadas:
Discovery Engine, BigQuery.

Uso:
  pip install google-cloud-discoveryengine google-cloud-bigquery
  python3 scripts/discoveryengine_import_dossie_bq.py
"""

from __future__ import annotations

import argparse
import sys

from google.api_core import exceptions as gexc
from google.api_core.client_options import ClientOptions
from google.cloud import bigquery
from google.cloud import discoveryengine_v1 as discoveryengine


# --- Configuração solicitada (override via flags) ---
PROJECT = "projeto-codex-br"
LOCATION = "global"
COLLECTION = "default_collection"
DATA_STORE_ID = "dossie-aurora-bq"
DATA_STORE_DISPLAY_NAME = "Dossiê Aurora (BigQuery)"

BQ_DATASET = "dados_aurora"
BQ_TABLE = "tb_dossie_aurora_360"
BQ_VIEW = "vw_vertex_agent_dossie_aurora"

ID_COLUMN = "id"
TEXT_COLUMN = "dossie_texto_base"
# Campo dentro de struct/jsonData que o console costuma mapear como "Content"
CONTENT_JSON_KEY = "content"

BRANCH_ID = "0"


def _data_store_name(project: str, location: str, collection: str, data_store_id: str) -> str:
    return (
        f"projects/{project}/locations/{location}/collections/{collection}"
        f"/dataStores/{data_store_id}"
    )


def _branch_parent(project: str, location: str, collection: str, data_store_id: str, branch: str) -> str:
    return f"{_data_store_name(project, location, collection, data_store_id)}/branches/{branch}"


def ensure_bq_view(
    client: bigquery.Client,
    *,
    project: str,
    dataset: str,
    view_id: str,
    source_table: str,
) -> str:
    """Cria/atualiza VIEW com schema document (id + jsonData)."""
    view_ref = f"{project}.{dataset}.{view_id}"
    table_ref = f"{project}.{dataset}.{source_table}"
    query = f"""
    CREATE OR REPLACE VIEW `{view_ref}` AS
    SELECT
      CAST(TRIM(CAST({ID_COLUMN} AS STRING)) AS STRING) AS `id`,
      TO_JSON_STRING(
        STRUCT({TEXT_COLUMN} AS {CONTENT_JSON_KEY})
      ) AS `jsonData`
    FROM `{table_ref}`
    WHERE {ID_COLUMN} IS NOT NULL
    """
    job = client.query(query)
    job.result()
    return view_ref


def ensure_data_store(
    client: discoveryengine.DataStoreServiceClient,
    *,
    project: str,
    location: str,
    collection: str,
    data_store_id: str,
    display_name: str,
) -> None:
    name = _data_store_name(project, location, collection, data_store_id)
    try:
        client.get_data_store(name=name)
        print(f"Data Store já existe: {name}", flush=True)
        return
    except gexc.NotFound:
        pass

    parent = client.collection_path(project=project, location=location, collection=collection)
    ds = discoveryengine.DataStore(
        display_name=display_name,
        industry_vertical=discoveryengine.IndustryVertical.GENERIC,
        solution_types=[discoveryengine.SolutionType.SOLUTION_TYPE_SEARCH],
        # Texto pesquisável vem em jsonData/struct; datastore de busca estruturada.
        content_config=discoveryengine.DataStore.ContentConfig.NO_CONTENT,
    )
    op = client.create_data_store(
        parent=parent,
        data_store_id=data_store_id,
        data_store=ds,
    )
    print(f"Criando Data Store (operação longa): {op.operation.name}", flush=True)
    op.result()
    print(f"Data Store criado: {name}", flush=True)


def run_import(
    *,
    project: str,
    location: str,
    collection: str,
    data_store_id: str,
    dataset: str,
    table: str,
    wait: bool,
) -> str:
    client_options = (
        ClientOptions(api_endpoint=f"{location}-discoveryengine.googleapis.com")
        if location != "global"
        else None
    )
    doc_client = discoveryengine.DocumentServiceClient(client_options=client_options)

    parent = _branch_parent(project, location, collection, data_store_id, BRANCH_ID)
    req = discoveryengine.ImportDocumentsRequest(
        parent=parent,
        bigquery_source=discoveryengine.BigQuerySource(
            project_id=project,
            dataset_id=dataset,
            table_id=table,
            data_schema="document",
        ),
        reconciliation_mode=discoveryengine.ImportDocumentsRequest.ReconciliationMode.INCREMENTAL,
    )
    op = doc_client.import_documents(request=req)
    print(f"Importação iniciada (LRO): {op.operation.name}", flush=True)
    print(f"Parent branch: {parent}", flush=True)
    if wait:
        op.result()
        print("Importação concluída (operation.result() retornou).", flush=True)
    return op.operation.name


def main() -> int:
    parser = argparse.ArgumentParser(description="BQ → Discovery Engine Data Store (document schema)")
    parser.add_argument("--project", default=PROJECT)
    parser.add_argument("--location", default=LOCATION)
    parser.add_argument("--collection", default=COLLECTION)
    parser.add_argument("--data-store-id", default=DATA_STORE_ID)
    parser.add_argument("--dataset", default=BQ_DATASET)
    parser.add_argument("--table", default=BQ_TABLE, help="Tabela ou nome da view fonte para o import")
    parser.add_argument("--skip-view", action="store_true", help="Não criar/atualizar a VIEW (usa --table como está)")
    parser.add_argument("--view-id", default=BQ_VIEW, help="Nome da VIEW criada quando --skip-view não é usado")
    parser.add_argument("--no-wait", action="store_true", help="Não aguardar o LRO da importação")
    args = parser.parse_args()

    import_table = args.table
    if not args.skip_view:
        bq = bigquery.Client(project=args.project)
        view_fqn = ensure_bq_view(
            bq,
            project=args.project,
            dataset=args.dataset,
            view_id=args.view_id,
            source_table=args.table,
        )
        print(f"VIEW pronta: {view_fqn}", flush=True)
        import_table = args.view_id

    ds_client = discoveryengine.DataStoreServiceClient()
    ensure_data_store(
        ds_client,
        project=args.project,
        location=args.location,
        collection=args.collection,
        data_store_id=args.data_store_id,
        display_name=DATA_STORE_DISPLAY_NAME,
    )

    try:
        run_import(
            project=args.project,
            location=args.location,
            collection=args.collection,
            data_store_id=args.data_store_id,
            dataset=args.dataset,
            table=import_table,
            wait=not args.no_wait,
        )
    except gexc.GoogleAPICallError as e:
        print(f"Erro na API: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
