#!/usr/bin/env python3
"""
Consultas ao catálogo Arsenal TransparênciaBR (`arsenal_apis.json`).

Exemplos:
  python arsenal_registry.py list --grupo tcu
  python arsenal_registry.py list --prioridade imediata
  python arsenal_registry.py get pncp_planos_contratacao
  python arsenal_registry.py export-crawler --limite 50 --out /tmp/crawler_extra.json

Se `arsenal_apis.json` estiver ausente, carrega diretamente de `arsenal_source_data`.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DEFAULT_JSON = ROOT / "arsenal_apis.json"


def load_catalog(path: Optional[Path] = None) -> Dict[str, Any]:
    """Carrega catálogo completo (com endpoints + indices)."""
    p = path or DEFAULT_JSON
    if p.is_file():
        return json.loads(p.read_text(encoding="utf-8"))
    from arsenal_source_data import all_endpoints

    eps = all_endpoints()
    return {
        "schema_version": 1,
        "namespace": "transparenciabr",
        "endpoint_count": len(eps),
        "endpoints": eps,
        "indices": {},
    }


def iter_endpoints(
    catalog: Optional[Dict[str, Any]] = None,
    *,
    grupo_id: Optional[str] = None,
    prioridade: Optional[str] = None,
    tipo_acesso: Optional[str] = None,
    crawler_eligible: Optional[bool] = None,
    url_required: bool = False,
) -> Iterator[Dict[str, Any]]:
    cat = catalog or load_catalog()
    for ep in cat.get("endpoints") or []:
        if grupo_id and ep.get("grupo_id") != grupo_id:
            continue
        if prioridade and ep.get("prioridade") != prioridade:
            continue
        if tipo_acesso and ep.get("tipo_acesso") != tipo_acesso:
            continue
        if crawler_eligible is not None and bool(ep.get("crawler_eligible")) != crawler_eligible:
            continue
        if url_required:
            u = ep.get("url")
            if not u or "{" in str(u):
                continue
        yield ep


def endpoint_by_id(eid: str, catalog: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    cat = catalog or load_catalog()
    for ep in cat.get("endpoints") or []:
        if ep.get("id") == eid:
            return ep
    return None


def to_crawler_api_specs(
    endpoints: Iterable[Dict[str, Any]],
    *,
    staging_table: str = "staging_api_raw",
    timeout_sec: float = 60.0,
) -> List[Dict[str, Any]]:
    """
    Converte entradas HTTP concretas (URL sem template) para o formato de `registry_apis.json`.
    """
    out: List[Dict[str, Any]] = []
    for ep in endpoints:
        url = ep.get("url")
        if not url or "{" in url:
            continue
        fmt = (ep.get("formato") or "").lower()
        api_type = "xml_api" if fmt == "xml" else "json_api"
        out.append(
            {
                "id": ep["id"],
                "categoria": ep.get("grupo_id", ""),
                "nome": ep.get("nome", ep["id"]),
                "request_url": url,
                "type": api_type,
                "staging_table": staging_table,
                "enabled": True,
                "timeout_sec": timeout_sec,
                "method": ep.get("metodo", "GET"),
                "circuit_failure_threshold": 5,
                "circuit_recovery_sec": 90,
                "max_attempts": 5,
                "arsenal_prioridade": ep.get("prioridade"),
                "auth": ep.get("auth"),
            }
        )
    return out


def _cmd_list(args: argparse.Namespace) -> int:
    cat = load_catalog(Path(args.catalog) if args.catalog else None)
    ce: Optional[bool] = None
    if args.crawler == "yes":
        ce = True
    elif args.crawler == "no":
        ce = False
    it = iter_endpoints(
        cat,
        grupo_id=args.grupo,
        prioridade=args.prioridade,
        tipo_acesso=args.tipo,
        crawler_eligible=ce,
        url_required=args.soh_url,
    )
    rows = list(it)
    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    for ep in rows:
        u = ep.get("url") or (ep.get("bigquery_ref") or {}).get("full_table_id") or "—"
        print(f"{ep['id']}\t{ep.get('grupo_id')}\t{ep.get('prioridade')}\t{u}")
    print(f"# total: {len(rows)}", file=sys.stderr)
    return 0


def _cmd_get(args: argparse.Namespace) -> int:
    ep = endpoint_by_id(args.id, load_catalog(Path(args.catalog) if args.catalog else None))
    if not ep:
        print(f"Não encontrado: {args.id}", file=sys.stderr)
        return 1
    print(json.dumps(ep, ensure_ascii=False, indent=2))
    return 0


def _cmd_export_crawler(args: argparse.Namespace) -> int:
    cat = load_catalog(Path(args.catalog) if args.catalog else None)
    eps = list(
        iter_endpoints(
            cat,
            grupo_id=args.grupo,
            prioridade=args.prioridade,
            crawler_eligible=True,
            url_required=True,
        )
    )
    if args.limite:
        eps = eps[: args.limite]
    specs = to_crawler_api_specs(eps)
    payload = {
        "version": 3,
        "description": "Fragmento gerado por arsenal_registry.py — fundir manualmente ou por script com registry_apis.json",
        "apis": specs,
    }
    out_path = Path(args.out)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{len(specs)} specs -> {out_path}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Consultas ao arsenal_apis.json")
    ap.add_argument("--catalog", help="Caminho alternativo ao arsenal_apis.json")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sp = sub.add_parser("list", help="Listar filtros")
    sp.add_argument("--grupo", dest="grupo")
    sp.add_argument("--prioridade", dest="prioridade")
    sp.add_argument("--tipo", dest="tipo")
    sp.add_argument(
        "--crawler",
        choices=("any", "yes", "no"),
        default="any",
        help="Filtrar elegíveis ao crawler HTTP",
    )
    sp.add_argument("--soh-url", action="store_true", help="Só endpoints com URL concreta")
    sp.add_argument("--json", action="store_true")
    sp.set_defaults(func=_cmd_list)

    sg = sub.add_parser("get", help="Um endpoint por id")
    sg.add_argument("id")
    sg.set_defaults(func=_cmd_get)

    se = sub.add_parser("export-crawler", help="Exportar formato crawler")
    se.add_argument("--out", required=True)
    se.add_argument("--grupo")
    se.add_argument("--prioridade")
    se.add_argument("--limite", type=int, default=0)
    se.set_defaults(func=_cmd_export_crawler)

    args = ap.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
