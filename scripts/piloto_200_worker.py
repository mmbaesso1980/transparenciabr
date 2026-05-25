#!/usr/bin/env python3
"""
Worker do piloto 200 leads — usa apenas artefactos documentados no repo:
  - BigQuery `indeferimentos_brasil_raw` (schema motor 26)
  - Enriquecimento opcional BigDataCorp (mesmo contrato que `bigDataAdapter.js`)

DirectData: NÃO IMPLEMENTADO neste repositório. Se `DD_REGISTRATION_URL` / `DD_CPF_URL`
existirem, o POST é tentado com corpo JSON mínimo `{"Datasets": "..."}` — provavelmente
falhará até o operador documentar o contrato real; erros são registados e o fluxo segue.

Logs: nunca imprime CPF integral (máscara ***.*).
"""
from __future__ import annotations

import csv
import json
import logging
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional, Tuple

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("piloto_200")

GCP_PROJECT = os.environ.get("GCP_PROJECT", "transparenciabr")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "southamerica-east1")
BQ_TABLE = f"`{GCP_PROJECT}.tbr_leads_prev.indeferimentos_brasil_raw`"

INSS_DATASET_URL = "https://dados.gov.br/dados/conjuntos-dados/beneficios-indeferidos"

# Heurística conservadora — não substitui revisão humana (caso Salete / representante).
_EXCL = re.compile(
    r"DEFENSOR|MINIST(E|É)RIO\s+P[UÚ]BLICO|PROCURADOR|CURADOR|TUTOR|INTERDIT|"
    r"REPRESENTANTE|INTERVENTOR|GUARDI|MPF|M\.P\.|SUPERINTEND",
    re.IGNORECASE | re.UNICODE,
)


def mask_cpf(cpf: str) -> str:
    d = re.sub(r"\D", "", cpf or "")
    if len(d) != 11:
        return ""
    return f"***.{d[3:6]}.{d[6:9]}-**"


def polo_excluir(motivo: str, aps: str, especie: str) -> bool:
    blob = f"{motivo or ''}|{aps or ''}|{especie or ''}"
    return bool(_EXCL.search(blob))


def bq_json_rows(sql: str) -> List[Dict[str, Any]]:
    cmd = [
        "bq",
        "query",
        "--use_legacy_sql=false",
        f"--project_id={GCP_PROJECT}",
        f"--location={BQ_LOCATION}",
        "--format=json",
        "--quiet",
    ]
    p = subprocess.run(cmd, input=sql, capture_output=True, text=True, timeout=600)
    if p.returncode != 0:
        log.error("bq falhou: %s", p.stderr[:2000])
        return []
    out = (p.stdout or "").strip()
    if not out:
        return []
    try:
        data = json.loads(out)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        log.error("bq JSON inválido")
        return []


def bigdata_fetch(cpf_digits: str) -> Tuple[Optional[dict], str]:
    token = os.environ.get("BIGDATA_TOKEN")
    if not token:
        return None, "BIGDATA_TOKEN ausente — enriquecimento BigData ignorado."
    url = "https://plataforma.bigdatacorp.com.br/people"
    body = json.dumps(
        {"Datasets": "people_contacts,people_addresses", "q": f"doc{{{cpf_digits}}}", "Limit": 1}
    ).encode()
    headers = {
        "AccessToken": token,
        "TokenId": os.environ.get("BIGDATA_TOKEN_ID", ""),
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return None, f"BigData HTTP {e.code}: {e.read()[:500]!r}"
    except Exception as e:  # noqa: BLE001
        return None, f"BigData erro: {e}"
    results = raw.get("Result") or raw.get("result")
    if not isinstance(results, list) or not results:
        return raw, "BigData retornou sem Result[]."
    r0 = results[0]
    phones, emails, endereco = _bd_extract(r0)
    return {"phones": phones, "emails": emails, "address": endereco, "_raw_note": "ok"}, ""


def _bd_extract(result: dict) -> Tuple[List[str], List[str], str]:
    contacts = result.get("Contacts") or result.get("people_contacts") or []
    phones, emails = [], []
    if isinstance(contacts, list):
        for c in contacts:
            if not isinstance(c, dict):
                continue
            p = c.get("PhoneNumber") or c.get("phone_number")
            if p:
                phones.append(str(p))
            em = c.get("Email") or c.get("email")
            if em:
                emails.append(str(em).lower())
    addrs = result.get("Addresses") or result.get("people_addresses") or []
    endereco = ""
    if isinstance(addrs, list) and addrs:
        a = addrs[0]
        if isinstance(a, dict):
            parts = [
                a.get("Street") or a.get("street"),
                a.get("Number") or a.get("number"),
                a.get("Municipality") or a.get("municipality"),
                a.get("State") or a.get("state"),
                a.get("ZipCode") or a.get("zip_code"),
            ]
            endereco = " | ".join(str(x or "").strip() for x in parts if x)
    return phones[:5], emails[:5], endereco


def try_directdata_cpf(cpf_digits: str) -> Tuple[Optional[dict], str]:
    url = (os.environ.get("DD_CPF_URL") or "").strip()
    if not url:
        return None, "DD_CPF_URL não definido."
    payload = (os.environ.get("DD_CPF_BODY_JSON") or "").strip()
    if not payload:
        payload = json.dumps({"token": os.environ.get("DD_TOKEN", ""), "cpf": cpf_digits})
    headers = {"Content-Type": "application/json"}
    if os.environ.get("DD_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ.get('DD_TOKEN')}"
    req = urllib.request.Request(url, data=payload.encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            return json.loads(resp.read().decode()), ""
    except Exception as e:  # noqa: BLE001
        return None, f"DirectData CPF falhou: {e}"


def fetch_city(cidade: str, uf: str, slug: str, limit: int = 120) -> List[Dict[str, Any]]:
    uf_esc = uf.replace("'", "\\'")
    slug_esc = slug.lower()
    if not re.fullmatch(r"[a-z]{3,24}", slug_esc):
        raise ValueError(f"slug inválido: {slug_esc!r}")
    sql = f"""
SELECT
  REGEXP_REPLACE(CAST(cpf AS STRING), r'[^0-9]', '') AS cpf_digits,
  CAST(dt_nascimento AS STRING) AS dt_nascimento,
  CAST(uf AS STRING) AS uf,
  CAST(aps_nome AS STRING) AS aps_nome,
  CAST(motivo_indeferimento AS STRING) AS motivo_indeferimento,
  CAST(especie_nome AS STRING) AS especie_nome,
  CAST(dt_indeferimento AS STRING) AS dt_indeferimento,
  CAST(source_file AS STRING) AS source_file
FROM {BQ_TABLE}
WHERE UPPER(CAST(uf AS STRING)) = '{uf_esc}'
  AND REGEXP_CONTAINS(LOWER(CAST(aps_nome AS STRING)), r'{slug_esc}')
  AND cpf IS NOT NULL
  AND LENGTH(REGEXP_REPLACE(CAST(cpf AS STRING), r'[^0-9]', '')) = 11
  AND dt_nascimento IS NOT NULL
ORDER BY dt_indeferimento DESC
LIMIT {limit}
"""
    rows = bq_json_rows(sql)
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        cpf = row.get("cpf_digits") or ""
        if cpf in seen:
            continue
        if polo_excluir(
            str(row.get("motivo_indeferimento") or ""),
            str(row.get("aps_nome") or ""),
            str(row.get("especie_nome") or ""),
        ):
            log.info("Excluído polo heurístico cpf=%s", mask_cpf(cpf))
            continue
        seen.add(cpf)
        row["_cidade"] = cidade
        out.append(row)
        if len(out) >= 50:
            break
    return out


def score_row(telefone: str, email: str, endereco: str, nome: str) -> int:
    s = 25
    if nome.strip():
        s += 25
    if telefone:
        s += 20
    if email:
        s += 15
    if endereco:
        s += 15
    return min(s, 100)


def main() -> int:
    out_path = os.environ.get("PILOTO_OUT", "/tmp/piloto_200_FINAL.csv")
    summary_path = os.environ.get("PILOTO_SUMMARY", "/tmp/piloto_200_summary.json")

    targets: List[Tuple[str, str, str]] = [
        ("Belem", "PA", "belem"),
        ("Campinas", "SP", "campinas"),
        ("Valinhos", "SP", "valinhos"),
        ("Vitoria", "ES", "vitoria"),
    ]

    all_rows: List[Dict[str, str]] = []
    per_city: Dict[str, int] = {}

    for cidade, uf, slug in targets:
        log.info("Cidade %s/%s (slug APS %s)", cidade, uf, slug)
        seeds = fetch_city(cidade, uf, slug)
        per_city[f"{cidade}/{uf}"] = len(seeds)
        if len(seeds) < 50:
            log.warning(
                "Só %s seeds válidas para %s/%s — ajuste dados BQ ou filtros.",
                len(seeds),
                cidade,
                uf,
            )
        for row in seeds:
            cpf_d = row.get("cpf_digits") or ""
            obs_parts: List[str] = []
            nome = ""
            # RegistrationDataBrazil exige nome completo na fonte — microdados INSS no BQ não trazem.
            obs_parts.append(
                "DirectData RegistrationDataBrazil: não executado (sem nome na fonte primária)."
            )
            dd2, e2 = try_directdata_cpf(cpf_d)
            if dd2 and isinstance(dd2, dict):
                nome = str(dd2.get("nome") or dd2.get("name") or nome)
            elif e2:
                obs_parts.append(e2)

            bd, ebd = bigdata_fetch(cpf_d)
            if ebd:
                obs_parts.append(ebd)
            tel = em = end = ""
            if bd:
                tel = ";".join(bd.get("phones") or [])
                em = ";".join(bd.get("emails") or [])
                end = str(bd.get("address") or "")

            obs = " | ".join(obs_parts + [f"source_file={row.get('source_file')}"])

            all_rows.append(
                {
                    "cidade": cidade,
                    "uf": uf,
                    "nome_completo": nome,
                    "cpf_mascarado": mask_cpf(cpf_d),
                    "dt_nascimento": str(row.get("dt_nascimento") or ""),
                    "telefone": tel,
                    "email": em,
                    "endereco": end,
                    "fonte_primaria_url": INSS_DATASET_URL,
                    "score_confianca": str(score_row(tel, em, end, nome)),
                    "observacao": obs[:1800],
                }
            )

    hdr_lines = [
        "TransparenciaBR/AURORA",
        "Base legal: LGPD art. 7º IX + art. 11 II g",
        f"Fonte: {INSS_DATASET_URL} (microdados INSS) + enriquecimento BigDataCorp opcional",
        "Diagnóstico final cabe exclusivamente ao advogado responsável.",
        "Descadastro: contato@transparenciabr.com.br",
    ]
    fieldnames = [
        "cidade",
        "uf",
        "nome_completo",
        "cpf_mascarado",
        "dt_nascimento",
        "telefone",
        "email",
        "endereco",
        "fonte_primaria_url",
        "score_confianca",
        "observacao",
    ]
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        for h in hdr_lines:
            f.write(f"# {h}\n")
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(all_rows)

    with open(summary_path, "w", encoding="utf-8") as sf:
        json.dump({"por_cidade": per_city, "total": len(all_rows)}, sf, ensure_ascii=False, indent=2)

    log.info("Escrito %s (%s linhas de dados)", out_path, len(all_rows))
    return 0


if __name__ == "__main__":
    sys.exit(main())
