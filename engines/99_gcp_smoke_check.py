#!/usr/bin/env python3
"""
Verifica credenciais GCP / BigQuery antes do deploy.
Se falhar, imprime o tipo de excepção e a mensagem bruta (sem mocks).
"""

import os
import sys


def main() -> None:
    project = (
        os.environ.get("GCP_PROJECT")
        or os.environ.get("GOOGLE_CLOUD_PROJECT")
        or os.environ.get("GCLOUD_PROJECT")
        or ""
    ).strip()

    try:
        from google.auth import default as google_auth_default
        from google.cloud import bigquery

        creds, proj = google_auth_default()
        client = bigquery.Client(project=project or proj or None)
        pid = client.project
        job = client.query("SELECT 1 AS ok")
        rows = list(job.result())
        if not rows:
            raise RuntimeError("Consulta SELECT 1 não devolveu linhas.")
        print(f"OK BigQuery — project={pid} row={dict(rows[0].items())}")
    except BaseException as exc:
        et = type(exc).__name__
        msg = str(exc).strip() or repr(exc)
        print(f"ERRO_CREDENCIAL_GCP | {et} | {msg}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
