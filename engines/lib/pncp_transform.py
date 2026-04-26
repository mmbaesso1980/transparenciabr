"""
Transformações PNCP → BigQuery (tipagem, datas ISO, ofuscação LGPD).

Usado pelo engine ``02_engine_etl.py``. Mantém CNPJ institucional intacto.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping

# Campos conhecidos de documento corporativo — não aplicar máscara de CPF aqui.
CNPJ_FIELD_KEYWORDS: frozenset[str] = frozenset(
    {
        "cnpj",
        "cnpjcompra",
        "cnpjorgao",
        "cnpjcontratado",
        "cnpjfornecedor",
        "nifornecedor",
        "nifornecedorcompra",
        "nifornecedorempresa",
        "nicompra",
        "niorgao",
        "codigopessoa",
    }
)

CPF_FORMATTED = re.compile(r"\d{3}\.\d{3}\.\d{3}-\d{2}")
# Onze dígitos não colados a outros dígitos (evita recorte dentro de CNPJ de 14).
CPF_LOOSE = re.compile(r"(?<!\d)(\d{11})(?!\d)")

MASK_CPF = "***.***.***-**"


def _sha256_partial(raw: str, prefix_len: int = 16) -> str:
    h = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"[CPF_SHA256:{h[:prefix_len]}…]"


def _is_cnpj_like_key(key: str) -> bool:
    k = key.lower().replace("_", "").replace("-", "")
    if k in CNPJ_FIELD_KEYWORDS:
        return True
    return "cnpj" in k and "cpf" not in k


def _mask_cpf_digits(m: re.Match[str]) -> str:
    digits = m.group(1)
    return f"{digits[:3]}******{digits[-2:]}"


def redact_loose_cpfs_in_string(s: str, *, use_hash: bool) -> str:
    """
    Ofusca CPF solto em texto (formatado ``000.000.000-00`` ou 11 dígitos).

    Não interpreta CNPJ (14 dígitos contínuos permanece intocado pela regex de CPF).
    """

    def _fmt_repl(match: re.Match[str]) -> str:
        return _sha256_partial(match.group(0)) if use_hash else MASK_CPF

    out = CPF_FORMATTED.sub(_fmt_repl, s)

    def _loose_repl(m: re.Match[str]) -> str:
        digits = m.group(1)
        if use_hash:
            return _sha256_partial(digits)
        return _mask_cpf_digits(m)

    out = CPF_LOOSE.sub(_loose_repl, out)
    return out


def redact_loose_cpfs_in_value(
    value: Any,
    *,
    key: str,
    use_hash: bool,
) -> Any:
    """
    Aplica ofuscação recursiva. Valores sob chaves CNPJ-like não são alterados.
    """
    if _is_cnpj_like_key(key):
        return value
    if isinstance(value, str):
        return redact_loose_cpfs_in_string(value, use_hash=use_hash)
    if isinstance(value, list):
        return [redact_loose_cpfs_in_value(v, key=key, use_hash=use_hash) for v in value]
    if isinstance(value, dict):
        return {
            str(k): redact_loose_cpfs_in_value(v, key=str(k), use_hash=use_hash)
            for k, v in value.items()
        }
    return value


def _currency_key(key: str) -> bool:
    k = key.lower()
    if any(x in k for x in ("valor", "preco", "preço", "montante", "total", "price")):
        return True
    return False


def _parse_brazilian_money(s: str) -> float | None:
    t = s.strip()
    if not t:
        return None
    t = t.replace("R$", "").replace(" ", "").strip()
    # 1.234,56 ou 1234,56
    if "," in t and "." in t:
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif "," in t:
        t = t.replace(".", "").replace(",", ".")
    else:
        t = t.replace(".", "")
    try:
        return float(t)
    except ValueError:
        return None


def coerce_currency(value: Any) -> float | None:
    """Normaliza valores monetários para FLOAT64 (BigQuery)."""
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, str):
        return _parse_brazilian_money(value)
    return None


def normalize_date_to_iso8601(value: Any) -> str | None:
    """
    Converte datas para string ISO 8601 (UTC com ``Z`` quando houver horário).
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        else:
            value = value.astimezone(timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day, tzinfo=timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
    if not isinstance(value, str):
        return None
    s = value.strip()
    if not s:
        return None
    # Já ISO
    if "T" in s and len(s) >= 10:
        if s.endswith("Z") or "+" in s[10:] or "-" in s[10:]:
            try:
                dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
                return normalize_date_to_iso8601(dt)
            except ValueError:
                return s
        return s if len(s) >= 19 else s
    # YYYYMMDD
    if len(s) == 8 and s.isdigit():
        y, mo, d = int(s[:4]), int(s[4:6]), int(s[6:8])
        return datetime(y, mo, d, tzinfo=timezone.utc).date().isoformat() + "T00:00:00Z"
    # YYYY-MM-DD
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        try:
            y, mo, da = int(s[:4]), int(s[5:7]), int(s[8:10])
            return datetime(y, mo, da, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
        except ValueError:
            return s[:10] + "T00:00:00Z"
    # DD/MM/YYYY
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", s[:10])
    if m:
        da, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return datetime(y, mo, da, tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    return s


def _date_key(key: str) -> bool:
    k = key.lower()
    if "data" in k:
        return True
    if k.startswith("dt") and "sistema" not in k:
        return True
    return False


def purify_for_bigquery(
    obj: Mapping[str, Any] | Any,
    *,
    parent_key: str = "",
    lgpd_hash_cpfs: bool = False,
) -> Any:
    """
    Percorre estrutura JSON-like: datas → ISO8601 string, moedas → float, LGPD em strings.
    """
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            ks = str(k)
            if isinstance(v, Mapping):
                out[ks] = purify_for_bigquery(v, parent_key=ks, lgpd_hash_cpfs=lgpd_hash_cpfs)  # type: ignore[arg-type]
            elif isinstance(v, list):
                out[ks] = [
                    purify_for_bigquery(i, parent_key=ks, lgpd_hash_cpfs=lgpd_hash_cpfs) for i in v
                ]
            elif isinstance(v, str):
                vv = v
                if _date_key(ks):
                    iso = normalize_date_to_iso8601(vv)
                    if iso is not None:
                        vv = iso
                elif _currency_key(ks):
                    c = coerce_currency(vv)
                    if c is not None:
                        vv = c
                vv = redact_loose_cpfs_in_string(vv, use_hash=lgpd_hash_cpfs)
                out[ks] = vv
            elif isinstance(v, (int, float)) and _currency_key(ks):
                out[ks] = float(v)
            elif isinstance(v, Decimal) and _currency_key(ks):
                try:
                    out[ks] = float(v)
                except (ValueError, InvalidOperation):
                    out[ks] = v
            elif isinstance(v, (datetime, date)):
                out[ks] = normalize_date_to_iso8601(v) or str(v)
            else:
                out[ks] = v
        return out
    if isinstance(obj, list):
        return [purify_for_bigquery(i, parent_key=parent_key, lgpd_hash_cpfs=lgpd_hash_cpfs) for i in obj]
    if isinstance(obj, str):
        s = obj
        if _date_key(parent_key):
            iso = normalize_date_to_iso8601(s)
            if iso is not None:
                s = iso
        elif _currency_key(parent_key):
            c = coerce_currency(s)
            if c is not None:
                s = c
        return redact_loose_cpfs_in_string(str(s), use_hash=lgpd_hash_cpfs)
    if isinstance(obj, (datetime, date)):
        return normalize_date_to_iso8601(obj) or str(obj)
    if isinstance(obj, Decimal):
        return float(obj)
    return obj


def apply_lgpd_structure(obj: Mapping[str, Any], *, use_hash: bool) -> dict[str, Any]:
    """Segunda passagem LGPD preservando chaves CNPJ-like sem tocar no valor."""
    return redact_loose_cpfs_in_value(dict(obj), key="root", use_hash=use_hash)  # type: ignore[return-value]
