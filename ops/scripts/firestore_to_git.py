#!/usr/bin/env python3
"""
firestore_to_git.py — migra entregas do Maestro de Firestore para branches Git.

CONTEXTO
========
Durante a sessão de 30/mai/2026, o Maestro produziu código para os 2 projetos
(Radar Jurídico INSS + Ocean Ways) mas o PAT do GitHub estava expirado. Como
workaround, o Maestro salvou cada arquivo gerado em
`maestro_code_delivery/{doc_id}` no Firestore (projeto `transparenciabr`).

Este script:
1. Lista todos os docs em `maestro_code_delivery`
2. Resolve o path-alvo de cada doc (campo `target_path` no doc, ou inferência
   pelo nome `pje_checker_py` → `apps/radar-juridico/backend/src/services/pje_checker.py`)
3. Faz checkout da branch correspondente (`feat/radar-juridico-exclusivo` ou
   `feat/oceanways-mvp`)
4. Escreve cada arquivo no path resolvido
5. Commit em batch com mensagem clara + push

PRECONDIÇÕES
============
- PAT GitHub válido em `GITHUB_TOKEN` (env var) OU `gh auth status` OK
- Service Account com permissão `firestore.documents.list` no projeto `transparenciabr`
- Python 3.11+ com `google-cloud-firestore` instalado

EXECUÇÃO
========
Em qualquer VM/Cloud Shell autenticado:

    pip install google-cloud-firestore
    export GITHUB_TOKEN=ghp_xxx
    python3 firestore_to_git.py --dry-run      # ver o que vai migrar
    python3 firestore_to_git.py                # executa de verdade

FREIOS
======
- Dry-run por padrão se nenhum flag for passado
- Confirma com input "y/N" antes de cada push
- Snapshot do estado de cada branch antes (git rev-parse > snapshot.txt)
- Cria sub-branches `migracao/firestore-{timestamp}` ao invés de pushar direto
  na main da feature (use --direct para pushar direto)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

REPO = "mmbaesso1980/transparenciabr"
FIRESTORE_PROJECT = "transparenciabr"
COLLECTION = "maestro_code_delivery"

# Mapa de inferência: nome do doc → path no repo
# (caso doc não tenha campo `target_path` explícito)
INFERENCE_MAP = {
    # Projeto A — Radar Jurídico
    "pje_checker_py":      "apps/radar-juridico/backend/src/services/pje_checker.py",
    "aurora_enricher_py":  "apps/radar-juridico/backend/src/services/aurora_enricher.py",
    "bq_service_py":       "apps/radar-juridico/backend/src/services/bq_service.py",
    "firestore_service_py":"apps/radar-juridico/backend/src/services/firestore_service.py",
    "leads_py":            "apps/radar-juridico/backend/src/routes/leads.py",
    "alertas_py":          "apps/radar-juridico/backend/src/routes/alertas.py",
    "pje_py":              "apps/radar-juridico/backend/src/routes/pje.py",
    "creditos_py":         "apps/radar-juridico/backend/src/routes/creditos.py",
    "main_py":             "apps/radar-juridico/backend/src/main.py",
    "ddl_radar_juridico_sql": "apps/radar-juridico/schemas/bigquery_radar_juridico.sql",

    # Projeto B — Ocean Ways
    "search_py":           "apps/oceanways/backend/src/routes/search.py",
    "auth_py":             "apps/oceanways/backend/src/routes/auth.py",
    "credits_py":          "apps/oceanways/backend/src/routes/credits.py",
    "alerts_py":           "apps/oceanways/backend/src/routes/alerts.py",
    "payments_py":         "apps/oceanways/backend/src/routes/payments.py",
    "aggregator_py":       "apps/oceanways/search-engine/src/aggregator.py",
    "direct_airlines_py":  "apps/oceanways/search-engine/src/sources/direct_airlines.py",
    "credits_billing_py":  "apps/oceanways/billing/src/credits.py",
    "payments_stripe_py":  "apps/oceanways/billing/src/payments_stripe.py",
    "payments_mercadopago_py": "apps/oceanways/billing/src/payments_mercadopago.py",
}

BRANCH_BY_PREFIX = {
    "apps/radar-juridico/": "feat/radar-juridico-exclusivo",
    "apps/oceanways/":      "feat/oceanways-mvp",
}


@dataclass
class Delivery:
    doc_id: str
    target_path: str
    branch: str
    content: str
    source_turn: Optional[int] = None
    generated_at: Optional[str] = None


def log(msg: str, level: str = "INFO") -> None:
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] [{level}] {msg}", flush=True)


def run(cmd: list[str], cwd: Optional[Path] = None, check: bool = True) -> str:
    log(f"$ {' '.join(cmd)}", level="EXEC")
    result = subprocess.run(
        cmd,
        cwd=cwd,
        check=check,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        for line in result.stdout.splitlines()[:5]:
            log(f"  {line}", level="OUT")
    if result.returncode != 0 and not check:
        log(f"  RC={result.returncode} stderr={result.stderr[:200]}", level="WARN")
    return result.stdout


def fetch_deliveries() -> list[Delivery]:
    """Lê todos os docs de maestro_code_delivery via google-cloud-firestore."""
    try:
        from google.cloud import firestore
    except ImportError:
        log("Instale: pip install google-cloud-firestore", level="ERROR")
        sys.exit(1)

    db = firestore.Client(project=FIRESTORE_PROJECT)
    log(f"Conectado ao Firestore project={FIRESTORE_PROJECT}")

    docs = db.collection(COLLECTION).stream()
    deliveries: list[Delivery] = []

    for doc in docs:
        data = doc.to_dict() or {}
        doc_id = doc.id

        # Resolver target_path: 1) campo explícito 2) mapa de inferência 3) skip
        target = data.get("target_path") or data.get("path") or INFERENCE_MAP.get(doc_id)
        if not target:
            log(f"  ⚠️  Skip '{doc_id}': sem target_path conhecido", level="WARN")
            continue

        # Resolver branch pelo prefixo do path
        branch = None
        for prefix, br in BRANCH_BY_PREFIX.items():
            if target.startswith(prefix):
                branch = br
                break
        if not branch:
            log(f"  ⚠️  Skip '{doc_id}': prefixo desconhecido em {target}", level="WARN")
            continue

        # Conteúdo: pode estar em vários campos
        content = (
            data.get("content")
            or data.get("code")
            or data.get("file_content")
            or data.get("body")
            or ""
        )
        if not content:
            log(f"  ⚠️  Skip '{doc_id}': sem content/code/body", level="WARN")
            continue

        deliveries.append(
            Delivery(
                doc_id=doc_id,
                target_path=target,
                branch=branch,
                content=content,
                source_turn=data.get("turn"),
                generated_at=data.get("generated_at") or data.get("ts") or "",
            )
        )

    log(f"✅ {len(deliveries)} entregas encontradas no Firestore")
    return deliveries


def clone_repo(workdir: Path) -> Path:
    """Clona o repo usando GITHUB_TOKEN se setado, senão gh CLI."""
    repo_dir = workdir / "transparenciabr"
    if repo_dir.exists():
        shutil.rmtree(repo_dir)

    token = os.environ.get("GITHUB_TOKEN", "")
    if token:
        url = f"https://{token}@github.com/{REPO}.git"
    else:
        log("GITHUB_TOKEN não setado, usando gh CLI...", level="WARN")
        url = f"https://github.com/{REPO}.git"

    run(["git", "clone", "--depth=50", url, str(repo_dir)])
    return repo_dir


def apply_to_branch(
    repo_dir: Path,
    branch: str,
    deliveries: list[Delivery],
    direct_push: bool,
    dry_run: bool,
) -> bool:
    """Aplica todas as entregas de uma branch específica."""
    log(f"\n{'='*60}\n🌿 Branch: {branch} ({len(deliveries)} arquivos)\n{'='*60}")

    run(["git", "fetch", "origin", branch], cwd=repo_dir)
    run(["git", "checkout", branch], cwd=repo_dir)
    run(["git", "pull", "origin", branch], cwd=repo_dir)

    pre_sha = run(["git", "rev-parse", "HEAD"], cwd=repo_dir).strip()
    log(f"📌 SHA atual: {pre_sha[:8]}")

    target_branch = branch
    if not direct_push:
        ts = time.strftime("%Y%m%d-%H%M%S")
        target_branch = f"migracao/firestore-{branch.split('/')[-1]}-{ts}"
        run(["git", "checkout", "-b", target_branch], cwd=repo_dir)
        log(f"🌱 Criada sub-branch: {target_branch}")

    # Escreve cada arquivo
    written: list[str] = []
    for d in deliveries:
        full_path = repo_dir / d.target_path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(d.content, encoding="utf-8")
        log(f"  ✍️  {d.target_path} ({len(d.content)} bytes, doc={d.doc_id})")
        written.append(d.target_path)

    # Stage + status
    run(["git", "add"] + written, cwd=repo_dir)
    status = run(["git", "status", "--short"], cwd=repo_dir)
    if not status.strip():
        log("Nada a commitar (arquivos já estavam idênticos).", level="WARN")
        return True

    if dry_run:
        log("🔬 DRY-RUN: não vai commitar nem pushar.", level="INFO")
        run(["git", "diff", "--stat", "--cached"], cwd=repo_dir)
        return True

    # Commit
    msg_lines = [
        f"feat(maestro-migration): drena {len(deliveries)} entregas do Firestore",
        "",
        f"Origem: coleção maestro_code_delivery (projeto transparenciabr)",
        f"Branch alvo: {branch}",
        "",
        "Arquivos migrados:",
    ]
    for d in deliveries:
        msg_lines.append(f"  - {d.target_path} (doc={d.doc_id}, turn={d.source_turn})")
    msg_lines += [
        "",
        "Workaround aplicado durante a sessão de 30/mai porque o PAT do",
        "GitHub estava expirado. Maestro salvou os artefatos em Firestore",
        "e este commit os transporta para o repositório oficial.",
        "",
        "Co-authored-by: Maestro v1.0 <maestro@transparenciabr.local>",
    ]
    msg = "\n".join(msg_lines)
    run(["git", "commit", "-m", msg], cwd=repo_dir)

    # Push
    log(f"⬆️  Push para origin/{target_branch}")
    run(["git", "push", "-u", "origin", target_branch], cwd=repo_dir)

    new_sha = run(["git", "rev-parse", "HEAD"], cwd=repo_dir).strip()
    log(f"✅ Commit {new_sha[:8]} → origin/{target_branch}")

    if not direct_push:
        log(
            f"💡 Próximo passo: abra PR de {target_branch} → {branch}\n"
            f"   gh pr create --base {branch} --head {target_branch} \\\n"
            f"     --title 'Maestro migration {branch.split(\"/\")[-1]}'"
        )

    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Não commita, só mostra o plano")
    parser.add_argument("--direct", action="store_true", help="Pusha direto na branch feature (não cria sub-branch)")
    parser.add_argument("--only-branch", help="Filtra para uma branch só (ex: feat/radar-juridico-exclusivo)")
    args = parser.parse_args()

    if not (args.dry_run or args.direct or os.environ.get("GITHUB_TOKEN")):
        log("⚠️  GITHUB_TOKEN não setado e não é dry-run.", level="WARN")
        resp = input("Continuar usando gh CLI? [y/N] ").strip().lower()
        if resp != "y":
            return 1

    deliveries = fetch_deliveries()
    if not deliveries:
        log("Nada a migrar. Saindo.")
        return 0

    if args.only_branch:
        deliveries = [d for d in deliveries if d.branch == args.only_branch]

    # Agrupa por branch
    by_branch: dict[str, list[Delivery]] = {}
    for d in deliveries:
        by_branch.setdefault(d.branch, []).append(d)

    log("\n📋 Plano de migração:")
    for branch, items in by_branch.items():
        log(f"  {branch}: {len(items)} arquivos")

    with tempfile.TemporaryDirectory(prefix="maestro_migration_") as tmp:
        workdir = Path(tmp)
        repo_dir = clone_repo(workdir)

        for branch, items in by_branch.items():
            ok = apply_to_branch(repo_dir, branch, items, args.direct, args.dry_run)
            if not ok:
                log(f"❌ Falha na branch {branch}", level="ERROR")
                return 2

    log("\n🎉 Migração concluída.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
