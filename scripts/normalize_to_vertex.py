#!/usr/bin/env python3
"""
Normaliza blobs JSONL no GCS (prefixos bq_export_* / firestore_export_*)
para o formato Vertex Search {id, structData}.

Uso:
  export GOOGLE_APPLICATION_CREDENTIALS=...
  export PROJ_VERTEX=projeto-codex-br
  python3 scripts/normalize_to_vertex.py [--dry-run] [--max-workers N]

Requer: google-cloud-storage
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor, as_completed

try:
    from google.cloud import storage
except ImportError:
    print("Instale: pip install google-cloud-storage", file=sys.stderr)
    sys.exit(1)

_PROJECT = os.environ.get("PROJ_VERTEX", "projeto-codex-br")
_BUCKET = os.environ.get("LAKE_BUCKET", "datalake-tbr-clean")


def _normalize_one(blob_name: str, dry_run: bool) -> str:
    if not blob_name.endswith(".jsonl"):
        return f"SKIP_NON_JSONL {blob_name}"
    out_name = (
        blob_name.replace("bq_export_", "vertex_ready/bq_").replace(
            "firestore_export_", "vertex_ready/fs_"
        )
    )
    client = storage.Client(project=_PROJECT)
    bucket = client.bucket(_BUCKET)
    out_blob = bucket.blob(out_name)
    if out_blob.exists():
        return f"SKIP_EXISTS {out_name}"

    raw = bucket.blob(blob_name).download_as_text()
    out_lines = []
    base = os.path.basename(blob_name)
    for i, line in enumerate(raw.splitlines()):
        try:
            doc = json.loads(line)
            doc_id = (
                doc.get("id")
                or doc.get("_id")
                or doc.get("codigo")
                or f"{base}_{i}"
            )
            out_lines.append(
                json.dumps(
                    {"id": str(doc_id)[:100], "structData": doc},
                    ensure_ascii=False,
                )
            )
        except json.JSONDecodeError:
            continue

    if dry_run:
        return f"DRY_RUN would write {len(out_lines)} docs -> {out_name}"
    if out_lines:
        out_blob.upload_from_string("\n".join(out_lines))
        return f"OK {out_name} ({len(out_lines)} docs)"
    return f"EMPTY {blob_name}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--max-workers", type=int, default=8)
    args = parser.parse_args()

    client = storage.Client(project=_PROJECT)
    blobs = []
    for prefix in ("bq_export_", "firestore_export_"):
        blobs.extend([b.name for b in client.list_blobs(_BUCKET, prefix=prefix)])

    blobs = sorted(set(blobs))
    print(
        f"Bucket={_BUCKET} project={_PROJECT} blobs={len(blobs)} dry_run={args.dry_run}",
        flush=True,
    )

    if args.dry_run:
        for name in blobs[:50]:
            print(_normalize_one(name, dry_run=True), flush=True)
        if len(blobs) > 50:
            print(f"... e mais {len(blobs) - 50} blobs (dry-run limitado a 50)", flush=True)
        return 0

    workers = max(1, min(args.max_workers, len(blobs), 16))
    if workers == 1 or len(blobs) < 4:
        for name in blobs:
            print(_normalize_one(name, dry_run=False), flush=True)
        return 0

    with ProcessPoolExecutor(max_workers=workers) as ex:
        futs = [ex.submit(_normalize_one, n, False) for n in blobs]
        for fut in as_completed(futs):
            r = fut.result()
            if r:
                print(r, flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
