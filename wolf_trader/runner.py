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
from wolf_trader.sinais_tecnicos import GeradorSinaisTecnicos
from wolf_trader.banca_politica import (
    BancaPolitica, VetorPolitico, atualizar_panorama, carregar_cache,
)
from wolf_trader.comando_telegram import (
    ComandoOperacional, OuvinteTelegram, SinalComandante, TipoComando,
)
from wolf_trader.doutrina_mestres import DoutrinaMestres
from wolf_trader.panorama_sinais import montar_sinais_politicos
from wolf_trader.report_periodico import EstatisticasDesempenho, montar_report
from devin_bridge.wolf_doctrine import Acao

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
        # RELÓGIO LENTO: intervalo de atualização da banca política (6h padrão).
        self.banca_intervalo_s: int = _env_int("WOLF_BANCA_INTERVALO_S", 6 * 3600)
        # RELÓGIO LENTO: intervalo de envio do report ao Comandante (6h padrão).
        self.report_intervalo_s: int = _env_int("WOLF_REPORT_INTERVALO_S", 6 * 3600)
        # Liga/desliga a banca política (fallback: só técnica se desligada).
        self.banca_ativa: bool = _env_bool("WOLF_BANCA_ATIVA", True)


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
    """Liga o alerter de Telegram se houver token; devolve callable(text)->None.

    A classe correta em devin_bridge.telegram_alerts e `TelegramAlerts` (o import
    antigo usava `TelegramAlerter`, nome inexistente, e o runner rodava mudo).
    Mantemos um fallback ao nome antigo por robustez, caso a VM tenha versao
    divergente do modulo.
    """
    try:
        try:
            from devin_bridge.telegram_alerts import TelegramAlerts as _Alerter
        except ImportError:  # compat com versao antiga do modulo
            from devin_bridge.telegram_alerts import TelegramAlerter as _Alerter  # type: ignore
        alerter = _Alerter()
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
        # Gerador de sinais técnicos PERSISTENTE entre ciclos (guarda histórico
        # de preço por token para o momentum T2). Uma instância por processo.
        self.sinais = GeradorSinaisTecnicos()
        # ---- RELÓGIO LENTO: banca política + input do Comandante + report ----
        self.doutrina = DoutrinaMestres()
        self.banca = BancaPolitica()
        # Vetor político corrente (carrega cache se existir; senão None).
        self.vetor_politico: Optional[VetorPolitico] = (
            carregar_cache() if cfg.banca_ativa else None)
        # Inputs políticos recentes do Comandante (membro da banca). Decaem via
        # Curie; os velhos são podados a cada ciclo.
        self.sinais_comandante: list[SinalComandante] = []
        # Ouvinte de comandos/sinais do Comandante via Telegram (getUpdates).
        self.ouvinte = OuvinteTelegram()
        # Estatísticas de desempenho acumuladas para o report de 6h.
        self.stats = EstatisticasDesempenho()
        # Marcadores dos relógios lentos (monotônico).
        self._ultima_banca = 0.0
        self._ultimo_report = time.monotonic()
        # Kill-switch lógico controlado por comando /pausar do Comandante
        # (independente de WOLF_ENABLED; ambos precisam estar on para operar).
        self._pausado_pelo_comandante = False

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

    def _sinais_politicos(self) -> list:
        """Monta os sinais da linha P (banca + Comandante), decaídos por Curie.

        Recomputado a cada ciclo rápido: o mesmo vetor do relógio lento vale por
        6h, mas sua CONVICÇÃO decai continuamente com a idade. Assim o panorama
        de 6h "envelhece" suavemente entre atualizações, sem saltos.
        """
        if not self.cfg.banca_ativa and not self.sinais_comandante:
            return []
        return montar_sinais_politicos(
            self.vetor_politico if self.cfg.banca_ativa else None,
            self.sinais_comandante,
            doutrina=self.doutrina,
        )

    def _podar_sinais_comandante(self) -> None:
        """Remove inputs do Comandante já desprezíveis (Curie ~ 0)."""
        vivos = []
        for sc in self.sinais_comandante:
            if self.doutrina.curie(sc.conviccao, sc.idade_s()) > 0.01:
                vivos.append(sc)
        self.sinais_comandante = vivos

    def _um_ciclo(self) -> None:
        mercados = self.engine.reader.listar_mercados(
            ativos=True, limit=self.cfg.limite_mercados, tag=self.cfg.tag
        )
        if not mercados:
            logger.info("Ciclo sem mercados retornados (R2 — nada a fazer).")
            self.stats.registrar_ciclo(
                avaliados=0, comprar=0, vender=0, hold=0, sem_dado=0, ordens=0)
            return

        # Sinais políticos do relógio lento (banca + Comandante), válidos para
        # todos os mercados deste ciclo. Recomputados por ciclo (decaimento).
        self._podar_sinais_comandante()
        sinais_pol = self._sinais_politicos()

        avaliados = enviados = gates = 0
        n_comprar = n_vender = n_hold = n_sem_dado = 0
        for mercado in mercados:
            for token_id in self._tokens_do_mercado(mercado):
                avaliados += 1
                # 1) Gera sinais TÉCNICOS reais a partir do book (bid/ask/mid +
                #    histórico de momentum). Soma os sinais POLÍTICOS da banca/
                #    Comandante (linha P) — a doutrina pondera ambos; o OVERRIDE
                #    TÉCNICO ainda pode rebaixar o político se o book gritar.
                cot = self.engine.reader.cotacao(token_id)
                sinais_tec = self.sinais.gerar(cot)
                # Só injeta política quando há leitura técnica (evita operar
                # só com macro num book sem dado — R2).
                sinais_prontos = list(sinais_tec)
                if sinais_tec and sinais_pol:
                    sinais_prontos.extend(sinais_pol)
                contexto = {"sinais_prontos": sinais_prontos}

                # 2) Decisão EXPLÍCITA da doutrina (reage a 100% dos tokens).
                decisao, _ = self.engine.decidir_mercado(
                    mercado, token_id, contexto)

                # 3) Classifica a reação para o log agregado do ciclo.
                if decisao.acao in (Acao.COMPRAR, Acao.COMPRAR_FORTE):
                    n_comprar += 1
                elif decisao.acao in (Acao.VENDER, Acao.REDUZIR):
                    n_vender += 1
                elif decisao.acao == Acao.MANTER:
                    n_hold += 1
                else:  # SEM_CONVICCAO — sem dado/sinal suficiente (R2)
                    n_sem_dado += 1

                # 4) Só COMPRAR/VENDER viram Proposta de ordem (respeita freios).
                if decisao.acao in (Acao.SEM_CONVICCAO, Acao.MANTER):
                    continue
                prop = self.engine.avaliar_mercado(
                    mercado, token_id, contexto)
                if prop is None:
                    continue
                resultado = self.engine.executar(prop)
                enviados += 1
                if getattr(prop, "precisa_gate", False):
                    gates += 1
                logger.info(
                    "Reação %s (%.0f%%) em '%.55s' -> %s",
                    decisao.acao.value, decisao.conviccao * 100,
                    mercado.pergunta, resultado,
                )
        # Registra o ciclo nas estatísticas do report de 6h.
        self.stats.registrar_ciclo(
            avaliados=avaliados, comprar=n_comprar, vender=n_vender,
            hold=n_hold, sem_dado=n_sem_dado, ordens=enviados, gates=gates,
        )
        logger.info(
            "Ciclo concluído: %d tokens | reações: COMPRAR=%d VENDER=%d "
            "HOLD=%d s/dado=%d | %d ordens processadas.",
            avaliados, n_comprar, n_vender, n_hold, n_sem_dado, enviados,
        )

    # -----------------------------------------------------------------------
    # RELÓGIO LENTO: banca política (6h), report (6h), input Telegram (por ciclo)
    # -----------------------------------------------------------------------
    def _atualizar_banca(self) -> None:
        """Recoleta notícias públicas e recomputa o vetor político (6/6h)."""
        if not self.cfg.banca_ativa:
            return
        try:
            self.vetor_politico = atualizar_panorama(self.banca)
            logger.info("Banca política atualizada: %s", self.vetor_politico.resumo)
        except Exception:  # noqa: BLE001 — banca nunca derruba o robô
            logger.exception("Falha ao atualizar a banca política.")

    def _enviar_report(self) -> None:
        """Envia o report de desempenho + panorama ao Comandante (6/6h)."""
        if not self.engine.telegram:
            return
        snap = self.stats.snapshot_e_zerar()
        texto = montar_report(
            snap, self.vetor_politico,
            modo_dry_run=self.cfg.dry_run,
            gate_usdc=self.engine.limites.gate_usdc,
            max_ordem_usdc=self.engine.limites.max_por_ordem_usdc,
            gasto_dia_usdc=getattr(self.engine, "_gasto_dia_usdc", 0.0),
        )
        try:
            self.engine.telegram(texto)
        except Exception:  # noqa: BLE001
            logger.warning("Falha ao enviar report ao Telegram.", exc_info=True)

    def _tratar_comando(self, cmd: ComandoOperacional) -> None:
        """Aplica um comando operacional do Comandante. NUNCA remove freios."""
        resposta = None
        if cmd.tipo == TipoComando.PAUSAR:
            self._pausado_pelo_comandante = True
            resposta = "\u23F8\uFE0F Operação pausada por ordem do Comandante. Freios e leitura seguem ativos. Envie /retomar para voltar."
        elif cmd.tipo == TipoComando.RETOMAR:
            self._pausado_pelo_comandante = False
            resposta = "\u25B6\uFE0F Operação retomada por ordem do Comandante."
        elif cmd.tipo == TipoComando.AGRESSIVO:
            nova = min(3.5, self.doutrina.cfg.agressividade * 1.25)
            self.doutrina.cfg.agressividade = nova
            resposta = f"\U0001F525 Agressividade elevada para {nova:.2f}. Freios de risco intactos."
        elif cmd.tipo == TipoComando.CONSERVADOR:
            nova = max(0.5, self.doutrina.cfg.agressividade * 0.8)
            self.doutrina.cfg.agressividade = nova
            resposta = f"\U0001F6E1\uFE0F Agressividade reduzida para {nova:.2f}."
        elif cmd.tipo == TipoComando.STATUS:
            self._enviar_report()
            return
        elif cmd.tipo == TipoComando.BANCA:
            v = self.vetor_politico
            if v and v.n_manchetes:
                resposta = f"\U0001F3DB\uFE0F Panorama da banca: {v.resumo}"
            else:
                resposta = "\U0001F3DB\uFE0F Banca sem panorama disponível no momento."
        if resposta and self.engine.telegram:
            try:
                self.engine.telegram(resposta)
            except Exception:  # noqa: BLE001
                logger.warning("Falha ao responder comando no Telegram.", exc_info=True)

    def _ouvir_comandante(self) -> None:
        """Faz polling do Telegram e incorpora sinais/comandos do Comandante.

        O Comandante é MEMBRO da banca: leituras políticas viram sinais linha P
        de alta convicção (decaem por Curie); comandos ajustam a operação sem
        jamais remover os freios de risco.
        """
        try:
            leitura = self.ouvinte.poll()
        except Exception:  # noqa: BLE001
            logger.warning("Falha ao ouvir o Comandante no Telegram.", exc_info=True)
            return
        for sc in leitura.sinais:
            self.sinais_comandante.append(sc)
            logger.info("Sinal do Comandante recebido: dir=%.2f conv=%.0f%% | %.60s",
                        sc.direcao, sc.conviccao * 100, sc.texto)
            if self.engine.telegram:
                try:
                    lado = "alta" if sc.direcao > 0 else ("baixa" if sc.direcao < 0 else "neutra")
                    self.engine.telegram(
                        f"\U0001F5F3\uFE0F Leitura do Comandante registrada na banca "
                        f"(direção {lado}, convicção {sc.conviccao:.0%}). "
                        "Somada aos sinais; a técnica de mercado ainda pode prevalecer."
                    )
                except Exception:  # noqa: BLE001
                    pass
        for cmd in leitura.comandos:
            logger.info("Comando do Comandante: %s %s", cmd.tipo.value, cmd.argumento)
            self._tratar_comando(cmd)

    def _relogios_lentos(self) -> None:
        """Dispara banca e report quando seus intervalos vencem (monotônico)."""
        agora = time.monotonic()
        if agora - self._ultima_banca >= self.cfg.banca_intervalo_s:
            self._atualizar_banca()
            self._ultima_banca = agora
        if agora - self._ultimo_report >= self.cfg.report_intervalo_s:
            self._enviar_report()
            self._ultimo_report = agora

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

        # Banca inicial no boot: se não houver cache fresco, coleta agora para o
        # robô já subir com um panorama político. Marca o relógio lento.
        if self.cfg.banca_ativa:
            precisa = (
                self.vetor_politico is None
                or self.vetor_politico.idade_s() >= self.cfg.banca_intervalo_s
            )
            if precisa:
                self._atualizar_banca()
            self._ultima_banca = time.monotonic()

        while not self._parar:
            # Ouve o Comandante a cada ciclo (comandos + sinais políticos).
            self._ouvir_comandante()
            # Dispara banca/report quando seus intervalos de 6h vencem.
            self._relogios_lentos()

            if not self.cfg.enabled or self._pausado_pelo_comandante:
                motivo = ("WOLF_ENABLED != true" if not self.cfg.enabled
                          else "pausado pelo Comandante")
                logger.info("Sem operar (%s) — seguindo ouvindo comandos.", motivo)
                time.sleep(self.cfg.intervalo_s)
                continue
            try:
                self._um_ciclo()
                time.sleep(self.cfg.intervalo_s)
            except KeyboardInterrupt:
                self.solicitar_parada()
            except Exception as e:  # noqa: BLE001 — resiliência: ciclo não derruba serviço
                self.stats.registrar_erro()
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
