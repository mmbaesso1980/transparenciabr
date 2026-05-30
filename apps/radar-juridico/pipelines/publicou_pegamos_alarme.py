#!/usr/bin/env python3
"""
Cloud Run Job — publicou_pegamos_alarme

Pipeline "publicou-pegamos-alarme": verifica publicações no DOU, Querido Diário
e PJe TRF3 para os leads monitorados na watchlist, notificando via FCM + Telegram.

Acionado por:
  - Cloud Scheduler: 2x/dia às 06:00 e 18:00 BRT
  - Pub/Sub topic: radar-juridico-alertas (para acionamento on-demand)

Variáveis de ambiente esperadas:
    GOOGLE_CLOUD_PROJECT    — projeto GCP
    BQ_LOCATION             — southamerica-east1
    FIRESTORE_PROJECT       — projeto Firestore
    PJE_TOKEN               — token de advogado PJe TRF3 (opcional)
    TELEGRAM_BOT_TOKEN      — token do bot Telegram (Secret Manager)
    FCM_SERVER_KEY          — chave FCM (Secret Manager)
    DRY_RUN                 — se '1', não envia notificações (log apenas)
    MAX_ALERTAS_POR_RUN     — limite de alertas processados (default: 500)

Referência arquitetural:
    cloudrun/dossieV1Pipeline/main.py — padrão Cloud Run Job do repo
    engines/ingestors/runners/crawl_dou_inlabs.py — crawler DOU
    engines/ingestors/runners/crawl_querido_diario.py — Querido Diário
    apps/radar-juridico/docs/ARCHITECTURE.md — fluxo completo
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import sys
import time
import traceback
from datetime import datetime, timezone
from typing import Any

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
)
logger = logging.getLogger("publicou-pegamos-alarme")

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
GCP_PROJECT = os.environ.get("GOOGLE_CLOUD_PROJECT", "transparenciabr")
BQ_LOCATION = os.environ.get("BQ_LOCATION", "southamerica-east1")
FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", GCP_PROJECT)
PJE_TOKEN = os.environ.get("PJE_TOKEN", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"
MAX_ALERTAS_POR_RUN = int(os.environ.get("MAX_ALERTAS_POR_RUN", "500"))

# Coleções Firestore
FS_ALERTAS_ROOT = "radar_juridico_alertas"  # /{uid}/watches/{alertaId}
FS_PJE_CACHE = "radar_juridico_pje_cache"

# Tabelas BigQuery
BQ_ALERTAS_WATCHLIST = f"`{GCP_PROJECT}.radar_juridico.alertas_watchlist`"
BQ_ALERTAS_LOG = f"`{GCP_PROJECT}.radar_juridico.alertas_log`"
BQ_LGPD_AUDIT = f"`{GCP_PROJECT}.radar_juridico.lgpd_audit_radar`"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def hash_cpf(cpf: str) -> str:
    """Hash SHA-256 do CPF — NUNCA logar CPF em claro."""
    digits = "".join(c for c in cpf if c.isdigit())
    return hashlib.sha256(digits.encode()).hexdigest()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Caminho 1: DOU via Inlabs API
# ---------------------------------------------------------------------------

class DouScanner:
    """
    Scanner de publicações no Diário Oficial da União via Inlabs API.

    TODO(maestro): implementar consulta à API Inlabs:
    - Endpoint: https://inlabs.in.gov.br/index.php
    - Autenticação: token JWT (solicitar em https://inlabs.in.gov.br)
    - Busca por: numero_processo, NB (número do benefício), nome (quando Caminho C/D)

    Referência: engines/ingestors/runners/crawl_dou_inlabs.py

    Input esperado (por alerta):
        alerta = {
          "alerta_id": "uuid-xxx",
          "tipo_monitor": "numero_processo",
          "numero_processo": "5001234-12.2025.4.03.6183",
          "uid": "firebase-uid"
        }

    Output esperado:
        {
          "encontrou": True,
          "publicacao_url": "https://www.in.gov.br/en/web/dou/-/...",
          "publicacao_data": "2026-05-30",
          "resumo": "Trecho relevante sem PII",
          "fonte": "DOU"
        }
    """

    async def scan(self, alerta: dict) -> dict | None:
        """
        Escaneia o DOU pelo processo/benefício do alerta.
        Retorna dict com publicação se encontrada, None se não encontrou.

        TODO(maestro): implementar via Inlabs API.
        Recomendação: usar httpx.AsyncClient com timeout=30s.
        Buscar pelo numero_processo como string completa e pelo NB quando disponível.
        """
        raise NotImplementedError("DouScanner.scan — TODO(maestro)")


# ---------------------------------------------------------------------------
# Caminho 2: Querido Diário (publicações municipais/estaduais)
# ---------------------------------------------------------------------------

class QueiridoDiarioScanner:
    """
    Scanner de publicações no Querido Diário (diários municipais e estaduais).
    Complementa o DOU para processos em instâncias estaduais.

    TODO(maestro): implementar via API Querido Diário:
    - Endpoint: https://queridodiario.ok.org.br/api
    - Documentação: https://queridodiario.ok.org.br/api/docs

    Referência: engines/ingestors/runners/crawl_querido_diario.py
    """

    async def scan(self, alerta: dict) -> dict | None:
        """
        TODO(maestro): implementar busca por numero_processo e UF do alerta.
        Filtrar por territory_id correspondente ao uf do lead.
        """
        raise NotImplementedError("QueiridoDiarioScanner.scan — TODO(maestro)")


# ---------------------------------------------------------------------------
# Caminho 3: PJe TRF3 — Anti-waste (litispendência)
# ---------------------------------------------------------------------------

class PjeAntiwaste:
    """
    Verificador de litispendência PJe TRF3.
    Implementa o "anti-waste check": antes de notificar, verifica se
    o processo já tem ação ativa no TRF3 — se sim, descarta silenciosamente.

    Os 4 sub-caminhos do AURORA (A/B/C/D) são verificados aqui
    para determinar se vale enriquecer com PII.

    TODO(maestro): implementar os 4 sub-caminhos:

    CAMINHO A — DATAPREV convênio (503 até convênio firmar):
        if DATAPREV_ENABLED:
            result = await dataprev_client.check_litispendencia(nb=numero_beneficio)
        else:
            return {"status": "DESCONHECIDO", "motivo": "DATAPREV não ativo"}

    CAMINHO B — PJe direto com token de advogado:
        if PJE_TOKEN:
            result = await pje_client.buscar_processo(
                numero=numero_processo,
                token=PJE_TOKEN
            )
            return {"status": "LIVRE"|"DESCARTAR", "processo": result}
        else:
            return {"status": "VERIFICAR", "motivo": "Sem token PJe"}

    CAMINHO C — Datajud CNJ (público, sem token):
        result = await datajud_client.search(numero_processo)
        # key: cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==

    CAMINHO D — Manual (sem verificação automática):
        return {"status": "VERIFICAR", "motivo": "Verificar manualmente no PJe"}
    """

    def __init__(self, pje_token: str = PJE_TOKEN):
        self.pje_token = pje_token
        self.datajud_key = os.environ.get(
            "DATAJUD_KEY",
            "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
        )

    async def check(self, alerta: dict) -> dict:
        """
        Verifica litispendência usando os 4 caminhos AURORA em cascata.

        Input: alerta dict com numero_processo, cpf_hash, uf
        Output:
            {
              "status": "LIVRE"|"VERIFICAR"|"DESCARTAR"|"DESCONHECIDO",
              "caminho_usado": "A"|"B"|"C"|"D",
              "numero_processo": "..." (se DESCARTAR),
              "tribunal": "TRF3" (se DESCARTAR)
            }

        TODO(maestro): implementar cascade A → B → C → D
        Para cada caminho, verificar cache BQ (pje_litispendencia_cache) primeiro.
        """
        logger.info(
            "PjeAntiwaste.check alerta_id=%s tipo=%s",
            alerta.get("alerta_id"), alerta.get("tipo_monitor")
        )

        # TODO(maestro): implementar
        #
        # PASSO 1: Verificar cache BQ
        # cache_key = alerta.get('numero_processo') or f"{alerta.get('cpf_hash')}:{alerta.get('uf')}"
        # cached = await bq_client.get_pje_cache(cache_key)
        # if cached and cached['expira_em'] > now():
        #     return cached
        #
        # PASSO 2: Tentar Caminho A (DATAPREV)
        # PASSO 3: Tentar Caminho B (PJe direto)
        # PASSO 4: Tentar Caminho C (Datajud público)
        # PASSO 5: Fallback Caminho D (manual)
        #
        # PASSO 6: Gravar no cache BQ

        return {"status": "DESCONHECIDO", "caminho_usado": "D"}


# ---------------------------------------------------------------------------
# Caminho 4: Notificação (FCM + Telegram)
# ---------------------------------------------------------------------------

class Notificador:
    """
    Envia notificações via FCM (app) e Telegram (fallback).

    TODO(maestro): implementar:

    FCM:
        from firebase_admin import messaging
        msg = messaging.Message(
            notification=messaging.Notification(
                title="Radar Jurídico — Publicação encontrada!",
                body=f"{numero_processo}: publicação no DOU em {data}"
            ),
            token=fcm_token_do_usuario,
        )
        messaging.send(msg)

    Telegram (fallback quando FCM falha ou usuário prefere Telegram):
        POST https://api.telegram.org/bot{TOKEN}/sendMessage
        {
          "chat_id": "6483072695",  # chat_id Baesso — CORRETO 8 dígitos
          "text": "...",
          "parse_mode": "HTML"
        }

    Chat ID correto Baesso: 6483072695 (8 dígitos — não usar 643072695)
    """

    async def notificar_fcm(self, uid: str, payload: dict) -> bool:
        """
        TODO(maestro): buscar FCM token do usuário no Firestore
        (usuarios/{uid}.fcm_token) e enviar push notification.
        Retorna True se sucesso, False se falha.
        """
        raise NotImplementedError("Notificador.notificar_fcm — TODO(maestro)")

    async def notificar_telegram(self, chat_id: str, mensagem: str) -> bool:
        """
        TODO(maestro): usar httpx para POST na Telegram API.
        Formato: HTML para links e negrito.
        Referência: functions/src/maestro/telegramBot.js
        """
        if not TELEGRAM_BOT_TOKEN:
            logger.warning("TELEGRAM_BOT_TOKEN não configurado — pulando Telegram")
            return False
        raise NotImplementedError("Notificador.notificar_telegram — TODO(maestro)")


# ---------------------------------------------------------------------------
# Orquestrador principal
# ---------------------------------------------------------------------------

class PublicouPegamosOrquestrador:
    """
    Orquestra o pipeline completo: lê watchlist → escaneia → anti-waste → notifica.

    TODO(maestro): implementar __call__ com o fluxo completo:

    1. Carregar watchlist de alertas ATIVOS do Firestore
    2. Para cada alerta (até MAX_ALERTAS_POR_RUN):
        a. Executar DouScanner.scan()
        b. Executar QueiridoDiarioScanner.scan() (se DOU não encontrou)
        c. Se encontrou publicação:
            i.  PjeAntiwaste.check() — verificar litispendência
            ii. Se status=DESCARTAR → gravar log + silenciar
            iii. Se status=LIVRE ou VERIFICAR → notificar
        d. Atualizar Firestore: ultimo_check + pje_status
        e. Gravar em BQ: alertas_log + lgpd_audit_radar
    3. Logar resumo: N alertas processados, M publicações encontradas, K notificações enviadas
    """

    def __init__(self):
        self.dou = DouScanner()
        self.querido_diario = QueiridoDiarioScanner()
        self.pje_check = PjeAntiwaste()
        self.notificador = Notificador()

    async def run(self, dry_run: bool = DRY_RUN) -> dict:
        """
        Executa o pipeline completo.

        TODO(maestro): implementar loop de alertas.

        Output esperado:
        {
          "alertas_processados": 45,
          "publicacoes_encontradas": 3,
          "notificacoes_enviadas": 3,
          "descartados_litispendencia": 1,
          "erros": 0,
          "duracao_seg": 12.4,
          "dry_run": False
        }
        """
        logger.info(
            "PublicouPegamosOrquestrador.run iniciando | dry_run=%s | max_alertas=%s",
            dry_run, MAX_ALERTAS_POR_RUN
        )
        t0 = time.perf_counter()

        # TODO(maestro): implementar fluxo principal
        # alertas = await self._load_watchlist()
        # ...

        logger.warning("TODO(maestro): pipeline não implementado — scaffold apenas")
        return {
            "alertas_processados": 0,
            "publicacoes_encontradas": 0,
            "notificacoes_enviadas": 0,
            "descartados_litispendencia": 0,
            "erros": 0,
            "duracao_seg": round(time.perf_counter() - t0, 2),
            "dry_run": dry_run,
            "status": "scaffold_apenas",
        }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="publicou-pegamos-alarme — Radar Jurídico INSS")
    p.add_argument("--dry-run", action="store_true", default=DRY_RUN,
                   help="Não envia notificações, apenas loga")
    p.add_argument("--max-alertas", type=int, default=MAX_ALERTAS_POR_RUN,
                   help="Máximo de alertas processados neste run")
    return p.parse_args()


async def async_main(args: argparse.Namespace) -> int:
    orquestrador = PublicouPegamosOrquestrador()
    result = await orquestrador.run(dry_run=args.dry_run)
    logger.info("Pipeline concluído: %s", json.dumps(result))
    return 0 if result.get("erros", 0) == 0 else 1


def main() -> int:
    import asyncio
    args = parse_args()
    try:
        return asyncio.run(async_main(args))
    except KeyboardInterrupt:
        logger.info("Interrompido pelo usuário")
        return 0
    except Exception as exc:
        logger.error("Erro fatal: %s\n%s", exc, traceback.format_exc())
        return 1


if __name__ == "__main__":
    sys.exit(main())
