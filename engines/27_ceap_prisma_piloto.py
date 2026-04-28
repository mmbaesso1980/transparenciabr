#!/usr/bin/env python3
"""
Engine 27 — Piloto CEAP × 12 Prismas Investigativos (camada factual + encaminhamento ao Oráculo).

Ingestão paginada da API pública CEAP da Câmara:
  GET https://dadosabertos.camara.leg.br/api/v2/deputados/{id}/despesas

Implementação efectiva neste motor:
  * Agente BENFORD — Lei de Benford sobre o 1.º dígito dos valores de documento (heurística).
Os restantes prismas registam estado ``pendente`` ou ``heuristica_basica`` sem inferir crimes.

SAÍDA:
  * Opcional: merge em ``transparency_reports/{deputado_id}`` — campo ``investigacao_prisma_ceap``.
  * Opcional: documentos em ``alertas_bodes`` (mensagem factual + metadados; ``explicacao_oraculo``
    deve ser preenchido pelo ``engines/07_gemini_translator.py`` quando GEMINI_API_KEY existir).

DISCLAIMER LEGAL (obrigatório nos alertas gravados):
  Classificações são indícios quantitativos ou estado de pipeline — não configuram decisão judicial.

Uso típico (GCP + GOOGLE_APPLICATION_CREDENTIALS configurados):

  python engines/27_ceap_prisma_piloto.py --deputado-id 220645 \\
      --gravar-alertas --merge-report

Referência ID deputada Erika Hilton (portal Câmara): /deputados/220645
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import math
import os
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from firebase_admin import firestore

from lib.firebase_app import init_firestore

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s | %(levelname)s | engine=27_prisma | %(message)s",
)
logger = logging.getLogger("transparenciabr.engine27")

BASE_CEAP = "https://dadosabertos.camara.leg.br/api/v2/deputados"
USER_AGENT = "TransparenciaBR-engines/27_ceap_prisma (+https://github.com/mmbaesso1980/transparenciabr)"

# Frequências Benford teóricas para dígitos 1–9
_BENFORD_EXPECTED = [math.log10(1 + 1 / d) for d in range(1, 10)]

LEGAL_DISCLAIMER = (
    "Indício ou métrica técnica derivada de dados públicos — não configura crime nem "
    "substitui apuração oficial."
)


def first_significant_digit(value_reais: float) -> Optional[int]:
    """Primeiro dígito significativo do valor absoluto em reais (> 0)."""
    try:
        v = abs(float(value_reais))
    except (TypeError, ValueError):
        return None
    if not math.isfinite(v) or v <= 0:
        return None
    while v < 1:
        v *= 10
    while v >= 10:
        v /= 10
    return int(v)


def benford_stats(values: List[float]) -> Dict[str, Any]:
    counts = defaultdict(int)
    total = 0
    for val in values:
        d = first_significant_digit(val)
        if d is None:
            continue
        counts[d] += 1
        total += 1
    if total < 90:
        return {
            "amostra_suficiente": False,
            "n_validos": total,
            "motivo": "Menos de 90 valores válidos para análise Benford estável.",
        }
    observed = [counts[d] / total for d in range(1, 10)]
    mad = sum(abs(observed[i] - _BENFORD_EXPECTED[i]) for i in range(9)) / 9
    chi_approx = (
        sum(
            ((counts[d] - total * _BENFORD_EXPECTED[d - 1]) ** 2)
            / max(total * _BENFORD_EXPECTED[d - 1], 1e-12)
            for d in range(1, 10)
        )
        if total
        else 0.0
    )
    return {
        "amostra_suficiente": True,
        "n_validos": total,
        "mad": round(mad, 5),
        "chi2_pearson_aprox": round(float(chi_approx), 4),
        "digitos_observados": {str(k): counts[k] for k in range(1, 10)},
        "interpretacao_administrativa": (
            "Desvio moderado ao padrão de Benford sugere revisão estatística de homogeneidade "
            "das notas (não implica fraude)."
            if mad > 0.08
            else "Distribuição de primeiro dígito compatível com referência Benford sob esta amostra."
        ),
    }


def fetch_all_despesas(deputado_id: str, sleep_sec: float = 0.25) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    headers = {"User-Agent": USER_AGENT}
    pagina = 1
    itens = 100
    todas: List[Dict[str, Any]] = []
    meta: Dict[str, Any] = {}

    while True:
        url = f"{BASE_CEAP}/{deputado_id}/despesas"
        params = {"pagina": pagina, "itens": itens}
        r = requests.get(url, headers=headers, params=params, timeout=60)
        r.raise_for_status()
        data = r.json()
        if pagina == 1:
            links = data.get("links") or []
            meta["api_links_sample"] = links[:3]

        dados = data.get("dados") or []
        if not dados:
            break
        todas.extend(dados)
        if len(dados) < itens:
            break
        pagina += 1
        if sleep_sec > 0:
            time.sleep(sleep_sec)

    return todas, meta


def parse_valor(row: Dict[str, Any]) -> Optional[float]:
    for key in ("valorLiquido", "valorDocumento", "valor_documento", "valor"):
        raw = row.get(key)
        if raw is None:
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    return None


def build_prisma_bundle(rows: List[Dict[str, Any]], deputado_id: str) -> Dict[str, Any]:
    valores = [v for r in rows if (v := parse_valor(r)) is not None]
    benford = benford_stats(valores)

    # Prismas: apenas BENFORD com métrica completa; demais explicitamente não concluídos neste motor.
    prismas: Dict[str, Any] = {
        "BENFORD": {"status": "calculado", "resultado": benford},
        "SANGUE_PODER": {"status": "pendente", "nota": "Requer QSA Receita + base gabinete — pipeline separado."},
        "ORACULO": {"status": "pendente", "nota": "Análise semântica de descrições — usar OCR/PDF quando disponível."},
        "FLAVIO": {"status": "pendente", "nota": "Cruzamento CEAP × agenda oficial — ingestão eventos."},
        "DRACULA": {"status": "pendente", "nota": "CNAE + ANVISA — engine 17/18."},
        "ESPECTRO": {"status": "pendente", "nota": "Correlação divulgação × produção legislativa — módulo ESPECTRO."},
        "ARIMA": {"status": "pendente", "nota": "BQML ARIMA_PLUS — tabela ceap agregada."},
        "KMEANS": {"status": "pendente", "nota": "Clusters fornecedor — engine 15_ml_kmeans."},
        "DOC_AI": {"status": "pendente", "nota": "Document AI / hash duplicidade."},
        "SANKEY": {"status": "pendente", "nota": "Subcontratações PNCP."},
        "IRONMAN": {"status": "pendente", "nota": "Fundamentação legal automatizada — revisão humana obrigatória."},
        "VISUAL": {"status": "heuristica_basica", "nota": "Grafo 3D — usar grafo_rede em transparency_reports quando populado."},
    }

    return {
        "deputado_id": deputado_id,
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "n_documentos_api": len(rows),
        "n_valores_numericos": len(valores),
        "fonte": "camara_api_v2_deputados_despesas",
        "prismas": prismas,
        "avisos": [LEGAL_DISCLAIMER],
    }


def _alert_doc_id(parts: str) -> str:
    return hashlib.sha256(parts.encode("utf-8")).hexdigest()


def gravar_alertas_resumo(
    fs: firestore.Client,
    *,
    deputado_id: str,
    bundle: Dict[str, Any],
) -> int:
    col = fs.collection("alertas_bodes")
    batch = fs.batch()
    n = 0

    msg_resumo = (
        f"Piloto CEAP: {bundle['n_documentos_api']} documentos recuperados da API pública; "
        f"{bundle['n_valores_numericos']} valores numéricos para métricas. {LEGAL_DISCLAIMER}"
    )
    doc_resumo = _alert_doc_id(f"{deputado_id}|PRISMA_RESUMO|{bundle['gerado_em']}")
    batch.set(
        col.document(doc_resumo),
        {
            "politico_id": deputado_id,
            "parlamentar_id": deputado_id,
            "tipo_risco": "PRISMA_CEAP_RESUMO",
            "mensagem": msg_resumo,
            "severidade": "INFORMATIVO",
            "criticidade": "NIVEL_1",
            "fonte": "engines/27_ceap_prisma_piloto.py",
            "criado_em": datetime.now(timezone.utc),
            "prisma_bundle_ref": bundle["gerado_em"],
            "detalhe_prisma": {"n_documentos": bundle["n_documentos_api"]},
        },
        merge=True,
    )
    n += 1

    benford = bundle["prismas"]["BENFORD"]["resultado"]
    msg_b = (
        f"Benford (1.º dígito): MAD={benford.get('mad', 'n/d')}; "
        f"{benford.get('interpretacao_administrativa', '')} {LEGAL_DISCLAIMER}"
        if benford.get("amostra_suficiente")
        else f"Benford: amostra insuficiente ({benford.get('n_validos', 0)} valores). {LEGAL_DISCLAIMER}"
    )
    doc_b = _alert_doc_id(f"{deputado_id}|PRISMA_BENFORD|{bundle['gerado_em']}")
    batch.set(
        col.document(doc_b),
        {
            "politico_id": deputado_id,
            "parlamentar_id": deputado_id,
            "tipo_risco": "PRISMA_BENFORD",
            "mensagem": msg_b,
            "severidade": "ANALITICO",
            "criticidade": "NIVEL_2",
            "fonte": "engines/27_ceap_prisma_piloto.py",
            "criado_em": datetime.now(timezone.utc),
            "metricas_benford": benford,
        },
        merge=True,
    )
    n += 1

    batch.commit()
    return n


def merge_transparency_report(fs: firestore.Client, deputado_id: str, bundle: Dict[str, Any]) -> None:
    ref = fs.collection("transparency_reports").document(deputado_id.strip())
    ref.set(
        {
            "investigacao_prisma_ceap": bundle,
            "metadados": {
                "prisma_engine": "27_ceap_prisma_piloto",
                "sincronizado_em": datetime.now(timezone.utc).isoformat(),
            },
        },
        merge=True,
    )


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Engine 27 — Piloto CEAP × prismas (Benford + ingestão API).")
    p.add_argument(
        "--deputado-id",
        default=os.environ.get("PRISMA_DEPUTADO_ID", "220645"),
        help="ID na API Câmara (ex.: Erika Hilton = 220645 conforme portal).",
    )
    p.add_argument("--dry-run", action="store_true", help="Só calcular e imprimir JSON (sem Firestore).")
    p.add_argument("--gravar-alertas", action="store_true", help="Escreve 2 docs resumo em alertas_bodes.")
    p.add_argument("--merge-report", action="store_true", help="Merge investigacao_prisma_ceap em transparency_reports.")
    p.add_argument("--output-json", default="", help="Guardar bundle JSON local (opcional).")
    return p.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    dep_id = str(args.deputado_id).strip()
    if not dep_id.isdigit():
        logger.error("--deputado-id deve ser numérico.")
        return 2

    try:
        rows, meta = fetch_all_despesas(dep_id)
    except requests.RequestException as exc:
        logger.exception("Falha ao contactar API da Câmara: %s", exc)
        return 3

    bundle = build_prisma_bundle(rows, dep_id)
    bundle["_fetch_meta"] = meta

    if args.output_json:
        Path(args.output_json).write_text(
            json.dumps(bundle, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        logger.info("JSON escrito em %s", args.output_json)

    logger.info(
        "OK deputado=%s documentos=%s valores_numericos=%s benford_ok=%s",
        dep_id,
        bundle["n_documentos_api"],
        bundle["n_valores_numericos"],
        bundle["prismas"]["BENFORD"]["resultado"].get("amostra_suficiente"),
    )

    if args.dry_run:
        print(json.dumps(bundle, ensure_ascii=False, indent=2, default=str))
        return 0

    fs = init_firestore()
    if args.merge_report:
        merge_transparency_report(fs, dep_id, bundle)
        logger.info("transparency_reports/%s atualizado (investigacao_prisma_ceap).", dep_id)

    if args.gravar_alertas:
        n = gravar_alertas_resumo(fs, deputado_id=dep_id, bundle=bundle)
        logger.info("alertas_bodes: %s documentos gravados.", n)

    return 0


if __name__ == "__main__":
    sys.exit(main())
