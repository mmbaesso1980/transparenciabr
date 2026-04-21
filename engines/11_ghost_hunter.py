#!/usr/bin/env python3
"""
Protocolo F.L.A.V.I.O. — Caçador de Fantasmas.

Cruza folha de gabinete (lotação nominal em Brasília) com reembolsos de viagem
para detetar quem recebe na capital mas opera quase só fora do DF (mock).
"""

from __future__ import annotations

import argparse
import hashlib
import logging
import sys
from datetime import datetime, timezone
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

# --- Mock: folha de gabinete (Brasília como lotação oficial) ---
MOCK_FOLHA_GABINETE = [
    {
        "funcionario_id": "fg-001",
        "nome": "Assessor A",
        "lotacao": "Brasília",
        "cargo": "Assessor parlamentar",
        "salario_mensal": 15000.0,
    },
    {
        "funcionario_id": "fg-002",
        "nome": "Secretário Y",
        "lotacao": "Brasília",
        "cargo": "Secretário parlamentar",
        "salario_mensal": 9800.0,
    },
    {
        "funcionario_id": "fg-003",
        "nome": "Estagiário Z",
        "lotacao": "Escritório regional São Paulo",
        "cargo": "Estágio supervisionado",
        "salario_mensal": 2200.0,
    },
]

# --- Mock: reembolsos de voos / deslocações (ano civil simulado) ---
MOCK_REEMBOLSOS_VIAGENS = [
    # Assessor A: 100% interior SP — nada no DF
    {
        "funcionario_id": "fg-001",
        "ano": 2025,
        "destino_regiao": "interior_sp",
        "uf_destino": "SP",
        "inclui_df": False,
        "valor_reembolso": 4200.0,
        "descricao": "Deslocação Campinas — Ribeirão Preto (reembolso trecho)",
    },
    {
        "funcionario_id": "fg-001",
        "ano": 2025,
        "destino_regiao": "interior_sp",
        "uf_destino": "SP",
        "inclui_df": False,
        "valor_reembolso": 3800.0,
        "descricao": "Circuito interior SP — eventos regionais",
    },
    {
        "funcionario_id": "fg-001",
        "ano": 2025,
        "destino_regiao": "interior_sp",
        "uf_destino": "SP",
        "inclui_df": False,
        "valor_reembolso": 4100.0,
        "descricao": "Voos Congonhas ↔ interior (sem conexão em BSB)",
    },
    # Secretário Y: parte relevante em DF → não é fantasma pelo critério 10%
    {
        "funcionario_id": "fg-002",
        "ano": 2025,
        "destino_regiao": "df",
        "uf_destino": "DF",
        "inclui_df": True,
        "valor_reembolso": 12000.0,
        "descricao": "Presença em Brasília — audiências e reuniões",
    },
    {
        "funcionario_id": "fg-002",
        "ano": 2025,
        "destino_regiao": "interior_sp",
        "uf_destino": "SP",
        "inclui_df": False,
        "valor_reembolso": 6000.0,
        "descricao": "Agenda estadual SP",
    },
]


def _alert_doc_id(politico_id: str, tipo: str, mensagem: str, criado_em_iso: str, fonte: str) -> str:
    raw = f"{politico_id}|{tipo}|{mensagem}|{criado_em_iso}|{fonte}".encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def agregar_gastos_por_funcionario(
    reembolsos: List[Dict[str, Any]],
    ano: int,
) -> Dict[str, Tuple[float, float]]:
    """Retorna funcionario_id -> (total_df, total_geral)."""
    acc: Dict[str, List[float]] = {}
    for r in reembolsos:
        if int(r.get("ano", 0)) != ano:
            continue
        fid = str(r.get("funcionario_id", ""))
        val = float(r.get("valor_reembolso") or 0)
        if fid not in acc:
            acc[fid] = [0.0, 0.0]
        acc[fid][1] += val
        if r.get("inclui_df") or str(r.get("destino_regiao", "")).lower() in ("df", "brasilia", "distrito_federal"):
            acc[fid][0] += val
    return {k: (v[0], v[1]) for k, v in acc.items()}


def avaliar_fantasma(
    lotacao: str,
    total_df: float,
    total_geral: float,
    *,
    limiar: float = 0.10,
) -> bool:
    lot = str(lotacao or "").strip().lower()
    if "brasília" not in lot and "brasilia" not in lot:
        return False
    if total_geral <= 0:
        return False
    pct_df = total_df / total_geral
    return pct_df < limiar


def main() -> int:
    parser = argparse.ArgumentParser(description="F.L.A.V.I.O. — folha × logística → alertas fantasma.")
    parser.add_argument("--politico-id", required=True, help="Parlamentar ancorado ao gabinete simulado.")
    parser.add_argument("--ano", type=int, default=2025)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    pid = args.politico_id.strip()
    ano = args.ano

    agreg = agregar_gastos_por_funcionario(MOCK_REEMBOLSOS_VIAGENS, ano)

    try:
        db = None if args.dry_run else init_firestore()
    except Exception as exc:
        logger.exception("Firestore: %s", exc)
        return 1

    escritos = 0
    for row in MOCK_FOLHA_GABINETE:
        fid = row["funcionario_id"]
        tot_df, tot_all = agreg.get(fid, (0.0, 0.0))
        fantasma = avaliar_fantasma(row.get("lotacao", ""), tot_df, tot_all)

        payload_extra = {
            "funcionario_id": fid,
            "nome_funcionario": row.get("nome"),
            "lotacao_declarada": row.get("lotacao"),
            "salario_mensal": row.get("salario_mensal"),
            "ano_referencia": ano,
            "total_reembolsos_df": tot_df,
            "total_reembolsos_geral": tot_all,
            "percentual_df": (tot_df / tot_all) if tot_all > 0 else None,
            "is_fantasma": fantasma,
        }

        if not fantasma:
            logger.info("Sem alerta — %s não classificado como fantasma.", row.get("nome"))
            continue

        mensagem = (
            f"Funcionário {row.get('nome')} consta lotado(a) em {row.get('lotacao')} com remuneração "
            f"R$ {row.get('salario_mensal', 0):,.0f}/mês, mas apenas "
            f"{(tot_df / tot_all * 100) if tot_all else 0:.1f}% dos reembolsos de viagem no ano {ano} "
            f"referem-se ao DF (limiar < 10%). Padrão compatível com deslocação efetiva fora da capital."
        )

        criado = datetime.now(timezone.utc)
        criado_iso = criado.isoformat()
        fonte = "protocolo_flavio_mock"
        tipo = "FUNCIONARIO_FANTASMA"

        doc_body: Dict[str, Any] = {
            "politico_id": pid,
            "parlamentar_id": pid,
            "tipo_risco": tipo,
            "mensagem": mensagem,
            "severidade": "CRITICA",
            "criticidade": "CRITICA",
            "fonte": fonte,
            "criado_em": criado,
            "sincronizado_em": firestore.SERVER_TIMESTAMP,
            "detalhe_flavio": payload_extra,
            "is_fantasma": True,
        }

        doc_id = _alert_doc_id(pid, tipo, mensagem, criado_iso, fonte)

        if args.dry_run:
            logger.info("[dry-run] doc_id=%s payload=%s", doc_id, doc_body)
            escritos += 1
            continue

        db.collection(COLLECTION_ALERTAS).document(doc_id).set(doc_body, merge=True)
        escritos += 1
        logger.info("Alerta F.L.A.V.I.O. gravado — %s (%s)", doc_id, row.get("nome"))

    logger.info("F.L.A.V.I.O. concluído — alertas escritos: %d", escritos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
