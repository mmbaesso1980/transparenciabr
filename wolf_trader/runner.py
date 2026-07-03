"""
Runner de produção do WOLF-Trader: ponto de entrada executável para rodar como
serviço systemd 24/7 na VM.

Este módulo NÃO reimplementa doutrina nem risco. Ele apenas:
  1. Lê configuração de ambiente (secrets via Secret Manager, intervalos, freios).
  2. Instancia PolymarketReader + Signer + PolymarketTrader + WolfTraderEngine.
  3. Roda um loop contínuo: listar mercados -> avaliar cada token -> executar
     (respeitando DRY_RUN, freios de risco e gate de valor no Telegram).
  4. Nunca deixa uma exceção de ciclo derrubar o processo (auto-recuperação);
     só erros fatais de inicialização encerram (systemd reinicia).

SEGURANÇA (EXEC-011):
  - Chave privada lida do Secret Manager em runtime, nunca em disco/env.
  - DRY_RUN=true por padrão. Só opera de verdade com DRY_RUN=false explícito.
  - Kill-switch WOLF_ENABLED: se != "true", o loop dorme sem operar.
  - Freios (gate/ordem/dia/mercado) vêm de LimitesRisco (env WOLF_*).

Uso:
    python3 -m wolf_trader.runner
"""
from __future__ import annotations

import logging
import os
import signal
import sys
import time
from typing import Optional

from wolf_trader.polymarket_client import (
    PolymarketReader,
    PolymarketTrader,
    Signer,
    secret_manager_pk_provider,
    _parse_token_ids,
)
from wolf_trader.engine import WolfTraderEngine, LimitesRisco

logging.basicConfig(
    level=os.environ.get("WOLF_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger("wolf_trader.runner")


# ---------------------------------------------------------------------------
# Configuração de ambiente
# ---------------------------------------------------------------------------
def _env(key: str, default: str | None = None) -> str | None:
    return os.environ.get(key, default)


def _env_bool(key: str, default: bool) -> bool:
    return _env(key, str(default)).strip().lower() in ("1", "true", "yes", "on")


def _env_int(key: str, default: int) -> int:
    try:
        return int(_env(key, str(default)))
    except (TypeError, ValueError):
        return default


class RunnerConfig:
    """Toda a parametrização de runtime, lida do ambiente."""

    def __init__(self) -> None:
        # Projeto GCP onde vivem os secrets do WOLF.
        self.gcp_project: str = _env("WOLF_GCP_PROJECT", "transparenciabr")
        # Nomes dos secrets (Secret Manager).
        self.secret_pk: str = _env("WOLF_PK_SECRET", "WOLF_WALLET_PK")
        self.secret_deposit: str = _env("WOLF_DEPOSIT_SECRET", "WOLF_DEPOSIT_ADDRESS")
        # Endereço da carteira (funder). Se não vier por env, lê do Secret Manager.
        self.funder_address: Optional[str] = _env("WOLF_DEPOSIT_ADDRESS")
        # signature_type Polymarket: 0 EOA, 1 Proxy, 2 Safe, 3 POLY_1271.
        # Padrão 1 (Proxy) — fluxo mais comum quando se deposita pelo site do
        # Polymarket com MetaMask. Ajustável por env se necessário.
        self.signature_type: int = _env_int("WOLF_SIGNATURE_TYPE", 1)
        # Modo de operação: DRY_RUN=true simula, false opera de verdade.
        self.dry_run: bool = _env_bool("DRY_RUN", True)
        # Kill-switch operacional (sem editar código nem parar o serviço).
        self.enabled: bool = _env_bool("WOLF_ENABLED", True)
        # Cadência do loop, em segundos.
        self.intervalo_s: int = _env_int("WOLF_LOOP_INTERVAL_S", 15)
        # Quantos mercados varrer por ciclo.
        self.limite_mercados: int = _env_int("WOLF_MARKETS_PER_CYCLE", 50)
        # Tag opcional para filtrar mercados (ex.: "politics"). Vazio = todos.
        self.tag: Optional[str] = _env("WOLF_MARKET_TAG") or None
        # Backoff após erro de ciclo (segundos).
        self.backoff_s: int = _env_int("WOLF_ERROR_BACKOFF_S", 30)


# ---------------------------------------------------------------------------
# Fábrica de dependências
# ---------------------------------------------------------------------------
def _resolver_funder(cfg: RunnerConfig) -> str:
    """Resolve o endereço da carteira (funder): env primeiro, senão Secret Manager."""
    if cfg.funder_address:
        return cfg.funder_address.strip()
    provider = secret_manager_pk_provider(cfg.secret_deposit, cfg.gcp_project)
    endereco = provider()
    if not endereco:
        raise RuntimeError(
            f"Endereço da carteira ausente: defina WOLF_DEPOSIT_ADDRESS ou o secret "
            f"'{cfg.secret_deposit}' em {cfg.gcp_project}."
        )
    return endereco.strip()


def _montar_telegram():
    """Liga o TelegramAlerter se houver token; devolve um callable(text)->None."""
    try:
        from devin_bridge.telegram_alerts import TelegramAlerter
        alerter = TelegramAlerter()
        return lambda texto: alerter.send(texto)
    except Exception as e:  # noqa: BLE001
        logger.warning("Telegram indisponível (%s). Seguindo sem notificações.", e)
        return None


def montar_engine(cfg: RunnerConfig) -> WolfTraderEngine:
    reader = PolymarketReader()

    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)
    funder = _resolver_funder(cfg)
    signer = Signer(
        private_key_provider=pk_provider,
        funder_address=funder,
        signature_type=cfg.signature_type,
    )
    trader = PolymarketTrader(signer=signer, dry_run=cfg.dry_run)

    limites = LimitesRisco()  # lê env WOLF_ORDER_GATE_USDC / WOLF_MAX_*.
    telegram = _montar_telegram()

    engine = WolfTraderEngine(
        reader=reader,
        trader=trader,
        limites=limites,
        telegram=telegram,
    )
    return engine


# ---------------------------------------------------------------------------
# Loop principal
# ---------------------------------------------------------------------------
class Runner:
    def __init__(self, cfg: RunnerConfig, engine: WolfTraderEngine) -> None:
        self.cfg = cfg
        self.engine = engine
        self._parar = False

    def solicitar_parada(self, *_a) -> None:
        logger.info("Sinal de parada recebido. Encerrando após o ciclo atual.")
        self._parar = True

    def _tokens_do_mercado(self, mercado) -> list[str]:
        """Extrai token_ids do mercado (formatos variados da Gamma API).

        Delega ao normalizador canonico `_parse_token_ids`, que trata string
        JSON, lista de dicts e lista de strings. Defesa em profundidade: mesmo
        que `mercado.tokens` chegue como string JSON (bug historico), NUNCA
        itera caractere-a-caractere.
        """
        return _parse_token_ids(getattr(mercado, "tokens", None))

    def _um_ciclo(self) -> None:
        mercados = self.engine.reader.listar_mercados(
            ativos=True, limit=self.cfg.limite_mercados, tag=self.cfg.tag
        )
        if not mercados:
            logger.info("Ciclo sem mercados retornados (R2 — nada a fazer).")
            return

        avaliados = enviados = 0
        for mercado in mercados:
            for token_id in self._tokens_do_mercado(mercado):
                avaliados += 1
                prop = self.engine.avaliar_mercado(mercado, token_id)
                if prop is None:
                    continue
                resultado = self.engine.executar(prop)
                enviados += 1
                logger.info("Proposta em '%.60s' -> %s", mercado.pergunta, resultado)
        logger.info(
            "Ciclo concluído: %d tokens avaliados, %d propostas processadas.",
            avaliados, enviados,
        )

    def run(self) -> None:
        modo = "DRY_RUN (simulação)" if self.cfg.dry_run else "OPERAÇÃO REAL"
        logger.info(
            "WOLF-Trader runner iniciando | modo=%s | intervalo=%ds | "
            "gate=US$%.0f max_ordem=US$%.0f max_dia=US$%.0f",
            modo, self.cfg.intervalo_s,
            self.engine.limites.gate_usdc,
            self.engine.limites.max_por_ordem_usdc,
            self.engine.limites.max_diario_usdc,
        )
        if self.engine.telegram:
            try:
                self.engine.telegram(
                    "\U0001F43A WOLF-Trader iniciado na VM\n"
                    f"Modo: <b>{modo}</b>\n"
                    f"Intervalo: {self.cfg.intervalo_s}s | "
                    f"Gate: US$ {self.engine.limites.gate_usdc:.0f} | "
                    f"Máx/ordem: US$ {self.engine.limites.max_por_ordem_usdc:.0f}\n"
                    "Nenhuma promessa de retorno. Operação sob risco assumido pelo Comandante."
                )
            except Exception:  # noqa: BLE001
                logger.warning("Falha ao notificar início no Telegram.", exc_info=True)

        while not self._parar:
            if not self.cfg.enabled:
                logger.info("WOLF_ENABLED != true — kill-switch ativo, sem operar.")
                time.sleep(self.cfg.intervalo_s)
                continue
            try:
                self._um_ciclo()
                time.sleep(self.cfg.intervalo_s)
            except KeyboardInterrupt:
                self.solicitar_parada()
            except Exception as e:  # noqa: BLE001 — resiliência: ciclo não derruba serviço
                logger.exception("Erro no ciclo — aplicando backoff de %ds.", self.cfg.backoff_s)
                if self.engine.telegram:
                    try:
                        self.engine.telegram(
                            f"\u26A0\uFE0F WOLF-Trader: erro em ciclo — {type(e).__name__}: {str(e)[:180]}"
                        )
                    except Exception:  # noqa: BLE001
                        pass
                time.sleep(self.cfg.backoff_s)

        logger.info("WOLF-Trader runner encerrado.")


def main() -> int:
    cfg = RunnerConfig()
    try:
        engine = montar_engine(cfg)
    except Exception:  # noqa: BLE001
        logger.exception("Falha fatal ao inicializar o engine. Encerrando (systemd reinicia).")
        return 1

    runner = Runner(cfg, engine)
    signal.signal(signal.SIGTERM, runner.solicitar_parada)
    signal.signal(signal.SIGINT, runner.solicitar_parada)
    runner.run()
    return 0


if __name__ == "__main__":
    sys.exit(main())
