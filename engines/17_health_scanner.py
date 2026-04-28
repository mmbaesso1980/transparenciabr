#!/usr/bin/env python3
"""
Operação D.R.A.C.U.L.A. — cruzamento CEAP (OSS / saúde) × CNES (Data Lake GCS).

Objetivo: sinalizar "Laboratório Fantasma" — repasse milionário a entidades de perfil
OSS/saúde sem lastro claro de estabelecimento CNES (CNPJ ausente ou sem match no cadastro).

Uso (exemplos):
  DATALAKE_BUCKET_RAW=transparenciabr-datalake-raw \
  CEAP_INPUT_JSON=./ceap_oss_sample.json \
  python3 17_health_scanner.py

  python3 17_health_scanner.py --ceap-json ./ceap.json --cnes-local ./cnes_batch.json

O Admin SDK / BigQuery podem alimentar CEAP_INPUT_JSON (export query) e o CNES vem do
ingestor (GCS) em saude/cnes/.../payload_pag*.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

try:
    from google.cloud import storage
except ImportError:  # pragma: no cover
    storage = None  # type: ignore


BRL_MILLION = 1_000_000.0
DEFAULT_PREFIX = "saude/cnes"

OSS_SAUDE_PAT = re.compile(
    r"\b(OSS|ORGANIZA[ÇC][ÃA]O\s+SOCIAL|"
    r"FUNDAC[AÃ]O|ASSOCIA[ÇC][ÃA]O|"
    r"LABORAT|CL[IÍ]NICA|HOSPITAL|"
    r"SA[UÚ]DE|DIGN[OÓ]STIC|FARM[ÁA]CIA)\b",
    re.IGNORECASE,
)


def _parse_money(v: Any) -> float:
    if v is None:
        return 0.0
    if isinstance(v, (int, float)):
        return float(v) if v == v else 0.0
    s = str(v).strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _only_digits(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def normalize_cnpj(raw: Any) -> str:
    d = _only_digits(str(raw or ""))
    if len(d) >= 14:
        return d[:14]
    return ""


def looks_oss_saude(text: str) -> bool:
    return bool(text and OSS_SAUDE_PAT.search(text))


def load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_estabelecimentos(payload: Any) -> List[Dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        if isinstance(payload.get("estabelecimentos"), list):
            return payload["estabelecimentos"]
        # lote único
        if "codigo_cnes" in payload or "nome_razao_social" in payload:
            return [payload]
    return []


def index_cnes_establishments(rows: List[Dict[str, Any]]) -> Tuple[Set[str], Dict[str, List[str]]]:
    """Retorna cnpjs conhecidos e mapa cnpj -> nomes vistos."""
    cnpj_set: Set[str] = set()
    by_cnpj: Dict[str, List[str]] = defaultdict(list)
    for r in rows:
        cnpj = normalize_cnpj(
            r.get("numero_cnpj")
            or r.get("numero_cnpj_entidade")
            or r.get("cnpj")
            or r.get("cnpjCpf")
        )
        nome = str(
            r.get("nome_fantasia")
            or r.get("nome_razao_social")
            or r.get("nomeFantasia")
            or "",
        ).strip()
        if cnpj:
            cnpj_set.add(cnpj)
            if nome:
                by_cnpj[cnpj].append(nome[:120])
    return cnpj_set, dict(by_cnpj)


def iter_gcs_cnes_json(bucket_name: str, prefix: str, max_blobs: int) -> List[Dict[str, Any]]:
    if storage is None:
        raise RuntimeError("google-cloud-storage não instalado")
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    all_rows: List[Dict[str, Any]] = []
    blobs = list(client.list_blobs(bucket_name, prefix=prefix.rstrip("/") + "/"))
    json_blobs = [b for b in blobs if b.name.endswith(".json")][:max_blobs]
    for blob in json_blobs:
        raw = blob.download_as_bytes()
        payload = json.loads(raw.decode("utf-8"))
        all_rows.extend(extract_estabelecimentos(payload))
    return all_rows


def classify_row(
    supplier: str,
    valor: float,
    cnpj: str,
    cnpj_cnes: Set[str],
) -> Tuple[str, List[str]]:
    reasons: List[str] = []
    flag = "OK"

    if valor >= BRL_MILLION:
        reasons.append(f"Valor ≥ R$ 1.000.000 ({valor:,.0f})")
    if looks_oss_saude(supplier):
        reasons.append("Perfil OSS / saúde (heurística textual)")

    if not reasons:
        return "OK", []

    if cnpj and cnpj in cnpj_cnes:
        return "REPASSO_COM_CADASTRO_CNES", reasons

    if cnpj and cnpj not in cnpj_cnes:
        flag = "LABORATORIO_FANTASMA"
        reasons.append("CNPJ com repasse elevado mas sem match no lote CNES ingerido")
    elif not cnpj:
        flag = "LABORATORIO_FANTASMA"
        reasons.append("Sem CNPJ na nota — impossível cruzar com CNES")

    if flag == "LABORATORIO_FANTASMA" and valor < BRL_MILLION and not looks_oss_saude(supplier):
        return "OK", []

    if flag == "LABORATORIO_FANTASMA":
        return flag, reasons
    return "SUSPEITA_REVIEW", reasons


def main() -> int:
    ap = argparse.ArgumentParser(description="D.R.A.C.U.L.A. — scanner CEAP × CNES")
    ap.add_argument(
        "--ceap-json",
        default=os.environ.get("CEAP_INPUT_JSON", ""),
        help="JSON: lista de despesas [{txtFornecedor,cnpjCpf,vlrLiquido,...}]",
    )
    ap.add_argument(
        "--bucket",
        default=os.environ.get("DATALAKE_BUCKET_RAW", "transparenciabr-datalake-raw"),
    )
    ap.add_argument(
        "--cnes-prefix",
        default=os.environ.get("CNES_GCS_PREFIX", DEFAULT_PREFIX),
    )
    ap.add_argument("--max-blobs", type=int, default=80)
    ap.add_argument(
        "--cnes-local",
        default=os.environ.get("CNES_LOCAL_JSON", ""),
        help="Opcional: ficheiro JSON CNES (mesmo formato da API / ingestor)",
    )
    ap.add_argument("--output", "-o", default="", help="Escrever resultado JSON")
    args = ap.parse_args()

    cnes_rows: List[Dict[str, Any]] = []
    if args.cnes_local:
        payload = load_json(args.cnes_local)
        cnes_rows = extract_estabelecimentos(payload)
    else:
        try:
            cnes_rows = iter_gcs_cnes_json(
                args.bucket, args.cnes_prefix, args.max_blobs
            )
        except Exception as e:
            print(f"[D.R.A.C.U.L.A.] AVISO: não foi possível ler CNES do GCS: {e}", file=sys.stderr)
            cnes_rows = []

    cnpj_cnes, _ = index_cnes_establishments(cnes_rows)
    print(
        f"[D.R.A.C.U.L.A.] CNES: {len(cnes_rows)} estabelecimentos, {len(cnpj_cnes)} CNPJs distintos",
        file=sys.stderr,
    )

    if not args.ceap_json or not os.path.isfile(args.ceap_json):
        print(
            "[D.R.A.C.U.L.A.] Sem --ceap-json: apenas índice CNES calculado. "
            "Passe export CEAP (lista de notas) para flags.",
            file=sys.stderr,
        )
        out = {
            "motor": "D.R.A.C.U.L.A.",
            "cnes_estabelecimentos_indexados": len(cnes_rows),
            "cnpjs_cnes": len(cnpj_cnes),
            "flags": [],
        }
        text = json.dumps(out, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text)
        print(text)
        return 0

    ceap_data = load_json(args.ceap_json)
    if isinstance(ceap_data, dict) and "rows" in ceap_data:
        rows_in = ceap_data["rows"]
    elif isinstance(ceap_data, list):
        rows_in = ceap_data
    else:
        print("Formato CEAP inválido: esperado lista ou {rows: []}", file=sys.stderr)
        return 1

    flags: List[Dict[str, Any]] = []
    for i, row in enumerate(rows_in):
        if not isinstance(row, dict):
            continue
        supplier = str(
            row.get("txtFornecedor")
            or row.get("nomeFornecedor")
            or row.get("nome_fornecedor")
            or "",
        ).strip()
        valor = _parse_money(row.get("vlrLiquido") or row.get("valor_liquido") or row.get("valor"))
        cnpj = normalize_cnpj(row.get("cnpjCpf") or row.get("cnpj"))

        label, reasons = classify_row(supplier, valor, cnpj, cnpj_cnes)
        if label == "LABORATORIO_FANTASMA":
            flags.append(
                {
                    "indice": i,
                    "classificacao": label,
                    "fornecedor": supplier[:200],
                    "cnpj": cnpj or None,
                    "valor_reais": round(valor, 2),
                    "motivos": reasons,
                }
            )

    out = {
        "motor": "D.R.A.C.U.L.A.",
        "versao": "1.0",
        "cnes_estabelecimentos_indexados": len(cnes_rows),
        "entradas_ceap": len(rows_in),
        "laboratorios_fantasmas": flags,
    }
    text = json.dumps(out, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
