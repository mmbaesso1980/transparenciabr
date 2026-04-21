#!/usr/bin/env python3
"""
Crawler universal config-driven — lê registry_apis.json, ThreadPoolExecutor,
backoff exponencial e circuit breaker por API. Descarga bruta → BigQuery staging.

Variáveis: GCP_PROJECT, BQ_DATASET (default transparenciabr), REGISTRY_PATH,
DRY_RUN=1 (sem HTTP nem BQ).
"""

import argparse
import json
import logging
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.bigquery_helpers import (  # noqa: E402
    get_dataset_id,
    insert_staging_rows,
    new_batch_id,
    staging_row,
)
from lib.resilience import (  # noqa: E402
    breaker_for,
    call_with_exponential_backoff,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

HTTP_RETRY_STATUS = frozenset({429, 500, 502, 503, 504})


def load_registry(path: Path) -> Dict[str, Any]:
    if path.is_file():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {}
    apis = data.get("apis") or []
    if len(apis) < 10:
        from gen_registry import build_default_apis

        apis = build_default_apis()
        logger.warning(
            "Registry vazio ou curto — carregadas %s APIs em memória (gen_registry.build_default_apis).",
            len(apis),
        )
        data = {
            "version": data.get("version", 1),
            "description": data.get(
                "description",
                "Registro central — fallback em memória",
            ),
            "apis": apis,
        }
    return data


def fetch_one(
    spec: Dict[str, Any],
    batch_id: str,
    *,
    dry_run: bool,
    push_bq: bool,
) -> Dict[str, Any]:
    api_id = spec["id"]
    url = spec["request_url"]
    timeout = float(spec.get("timeout_sec", 45))
    max_attempts = int(spec.get("max_attempts", 5))
    breaker = breaker_for(
        api_id,
        failure_threshold=int(spec.get("circuit_failure_threshold", 5)),
        recovery_timeout_sec=float(spec.get("circuit_recovery_sec", 60)),
    )

    if not breaker.allow_request():
        logger.warning("[%s] circuit aberto — ignorado.", api_id)
        return {"api_id": api_id, "skipped": True, "reason": "circuit_open"}

    if dry_run:
        breaker.record_success()
        return {"api_id": api_id, "dry_run": True}

    def do_request():
        resp = requests.request(
            spec.get("method", "GET"),
            url,
            timeout=timeout,
            headers=spec.get("headers") or {},
        )
        if resp.status_code in HTTP_RETRY_STATUS or resp.status_code >= 500:
            resp.raise_for_status()
        return resp

    try:

        def retry_on(exc: BaseException) -> bool:
            if isinstance(exc, requests.HTTPError):
                code = getattr(exc.response, "status_code", None)
                return code in HTTP_RETRY_STATUS or (code is not None and code >= 500)
            return isinstance(exc, (requests.Timeout, requests.ConnectionError))

        resp = call_with_exponential_backoff(
            do_request,
            max_attempts=max_attempts,
            retry_on=retry_on,
        )
        status = resp.status_code
        try:
            payload = resp.json()
        except Exception:
            payload = resp.text[:500000]

        row = staging_row(
            api_id=api_id,
            source_url=url,
            payload=payload,
            http_status=status,
            batch_id=batch_id,
        )
        table = spec.get("staging_table", "staging_api_raw")
        if push_bq and status < 500:
            insert_staging_rows(table, [row])
        breaker.record_success()
        return {"api_id": api_id, "status": status, "table": table}
    except Exception as exc:
        breaker.record_failure()
        logger.exception("[%s] falha: %s", api_id, exc)
        err_row = staging_row(
            api_id=api_id,
            source_url=url,
            payload={"error": str(exc)},
            http_status=0,
            batch_id=batch_id,
        )
        if push_bq:
            try:
                insert_staging_rows(spec.get("staging_table", "staging_api_raw"), [err_row])
            except Exception:
                logger.warning("[%s] não foi possível registrar erro no BQ.", api_id)
        return {"api_id": api_id, "error": str(exc)}


def main() -> None:
    parser = argparse.ArgumentParser(description="Universal API crawler → BigQuery staging.")
    parser.add_argument(
        "--registry",
        default=os.environ.get("REGISTRY_PATH", str(ROOT / "registry_apis.json")),
        help="Caminho para registry_apis.json",
    )
    parser.add_argument("--workers", type=int, default=int(os.environ.get("CRAWLER_WORKERS", "12")))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-bq", action="store_true", help="Não grava no BigQuery")
    args = parser.parse_args()

    reg_path = Path(args.registry)
    if not reg_path.is_file():
        logger.error("Registry não encontrado: %s", reg_path)
        sys.exit(1)

    data = load_registry(reg_path)
    apis: List[Dict[str, Any]] = [a for a in data.get("apis", []) if a.get("enabled", True)]
    batch_id = new_batch_id()
    dry_run = args.dry_run or os.environ.get("DRY_RUN") == "1"
    push_bq = not args.no_bq and not dry_run and os.environ.get("SKIP_BQ") != "1"

    if push_bq:
        _ = get_dataset_id()
        logger.info("BigQuery dataset=%s batch=%s", get_dataset_id(), batch_id)
    else:
        logger.info("Execução sem BigQuery (dry=%s).", dry_run)

    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
        futs = [
            ex.submit(fetch_one, spec, batch_id, dry_run=dry_run, push_bq=push_bq)
            for spec in apis
        ]
        for fut in as_completed(futs):
            results.append(fut.result())

    ok = sum(1 for r in results if r.get("status", 0) and r["status"] < 400)
    logger.info("Concluído — %s jobs, ~%s HTTP 2xx/3xx.", len(results), ok)


if __name__ == "__main__":
    main()
