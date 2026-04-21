#!/usr/bin/env python3
"""
Operação Sangue e Poder — cruzamento genealógico × QSA / contratos (mock + fuzzy).
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import sys
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Tuple

_ENG = Path(__file__).resolve().parent
if str(_ENG) not in sys.path:
    sys.path.insert(0, str(_ENG))

from firebase_admin import firestore

from lib.firebase_app import init_firestore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

COLLECTION_ALERTAS = "alertas_bodes"

SIMILARITY_MIN = 0.85

# Parentesco simulado (estilo cadastro TSE / declaração)
MOCK_FAMILIARES = [
    {
        "parentesco": "cônjuge",
        "nome_completo": "Maria Helena Silva Santos",
        "cpf_mascarado": "***.***.***-42",
    },
    {
        "parentesco": "filho(a)",
        "nome_completo": "João Pedro Silva Santos",
        "cpf_mascarado": "***.***.***-88",
    },
]

# Fornecedores / QSA simulado
MOCK_FORNECEDORES = [
    {
        "cnpj": "45123456000199",
        "razao_social": "Construtora Horizonte Verde Ltda",
        "municipio_contrato": "Campinas",
        "uf": "SP",
        "socios_administradores": [
            "Maria H. Silva Santos",
            "Carlos Eduardo Prado",
        ],
        "valor_contrato_ref": 1_850_000.0,
    },
    {
        "cnpj": "33987654000155",
        "razao_social": "Logística União Sul ME",
        "municipio_contrato": "Curitiba",
        "uf": "PR",
        "socios_administradores": ["Fulano Beltrano"],
        "valor_contrato_ref": 220_000.0,
    },
]


def _norm(s: str) -> str:
    return " ".join(str(s).lower().split())


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, _norm(a), _norm(b)).ratio()


def melhor_par_familiar(
    familiares: List[Dict[str, Any]],
    socios: List[str],
) -> Tuple[Dict[str, Any], str, float] | None:
    best: Tuple[Dict[str, Any], str, float] | None = None
    for fam in familiares:
        nome_f = fam.get("nome_completo") or ""
        for soc in socios:
            sim = similarity(nome_f, soc)
            if best is None or sim > best[2]:
                best = (fam, soc, sim)
    return best


def _alert_doc_id(politico_id: str, tipo: str, mensagem: str, criado_em_iso: str, fonte: str) -> str:
    raw = f"{politico_id}|{tipo}|{mensagem}|{criado_em_iso}|{fonte}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Sangue e Poder — nepotismo cruzado (fuzzy).")
    parser.add_argument("--politico-id", required=True)
    parser.add_argument(
        "--municipio-base",
        default="Campinas",
        help="Município-base do mandato / base eleitoral para cruzamento com contrato.",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pid = args.politico_id.strip()
    municipio_politico = args.municipio_base.strip()

    try:
        db = None if args.dry_run else init_firestore()
    except Exception as exc:
        logger.exception("Firestore: %s", exc)
        return 1

    escritos = 0

    for forn in MOCK_FORNECEDORES:
        socios = forn.get("socios_administradores") or []
        if not isinstance(socios, list):
            continue
        hit = melhor_par_familiar(MOCK_FAMILIARES, socios)
        if hit is None:
            continue
        fam, socio_nome, sim = hit
        mun_contrato = str(forn.get("municipio_contrato") or "").strip()
        mesmo_municipio = mun_contrato.lower() == municipio_politico.lower()

        if sim <= SIMILARITY_MIN or not mesmo_municipio:
            logger.info(
                "Ignorado — sim=%.3f mun_match=%s (%s × %s)",
                sim,
                mesmo_municipio,
                fam.get("nome_completo"),
                forn.get("razao_social"),
            )
            continue

        mensagem = (
            f"Similaridade {sim:.2f} entre familiar ({fam.get('parentesco')}: {fam.get('nome_completo')}) "
            f"e sócio/administrador '{socio_nome}' na empresa {forn.get('razao_social')} (CNPJ {forn.get('cnpj')}). "
            f"Contrato público referenciado no município {mun_contrato}, coincidente com a base do parlamentar."
        )

        criado = datetime.now(timezone.utc)
        criado_iso = criado.isoformat()
        fonte = "operacao_sangue_poder_mock"
        tipo = "NEPOTISMO_CRUZADO"

        doc_body: Dict[str, Any] = {
            "politico_id": pid,
            "parlamentar_id": pid,
            "tipo_risco": tipo,
            "mensagem": mensagem,
            "severidade": "NIVEL_5",
            "criticidade": "NIVEL_5",
            "fonte": fonte,
            "criado_em": criado,
            "sincronizado_em": firestore.SERVER_TIMESTAMP,
            "detalhe_nepotismo": {
                "similaridade": round(sim, 4),
                "familiar": fam,
                "socio_admin_match": socio_nome,
                "fornecedor": forn,
                "municipio_politico": municipio_politico,
            },
        }

        doc_id = _alert_doc_id(pid, tipo, mensagem, criado_iso, fonte)

        if args.dry_run:
            logger.info("[dry-run] doc_id=%s payload_keys=%s", doc_id, list(doc_body.keys()))
            escritos += 1
            continue

        db.collection(COLLECTION_ALERTAS).document(doc_id).set(doc_body, merge=True)
        escritos += 1
        logger.info("Alerta NEPOTISMO_CRUZADO gravado — %s", doc_id)

    logger.info("Operação Sangue e Poder — alertas escritos: %d", escritos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
