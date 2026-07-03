"""Input do Comandante via Telegram — a voz humana na banca de pesquisas.

O Comandante Baesso é MEMBRO da banca de pesquisas, não um interruptor que
desliga os modelos matemáticos. Seus inputs via Telegram entram como um sinal da
linha P (POLÍTICA) de ALTA CONVICÇÃO, somado aos sinais dos analistas e dos
mestres — jamais um override absoluto que zera a doutrina técnica. (Diretiva do
Comandante: "Autonomia total. eu só sou um membro da banca de pesquisas. não
mude isso.")

Dois tipos de input são reconhecidos:

  1. SINAL POLÍTICO — o Comandante expressa uma leitura direcional
     ("Lula vai subir", "acho que o mercado X cai", "otimista com a economia").
     Vira um Sinal linha=P com convicção alta (calibrável) e direção do léxico.
     Decai via CURIE como qualquer sinal (idade desde o envio).

  2. COMANDO OPERACIONAL — ordens ao robô, com barra ou palavra-chave:
       /pausar  /retomar         -> liga/desliga o loop (kill-switch lógico)
       /agressivo  /conservador  -> ajusta o dial de agressividade em memória
       /status                   -> pede um relatório imediato
       /banca                    -> pede o panorama político atual
     Comandos NUNCA removem os freios de risco (gate US$1000, DRY_RUN, limites).

Este módulo faz APENAS polling (getUpdates com offset) e parsing. Ele não decide
nem executa — devolve estruturas que o runner incorpora. Sem mock: se a rede
falhar, retorna lista vazia e registra o motivo; o robô segue operando.
"""
from __future__ import annotations

import logging
import os
import re
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional

import requests

logger = logging.getLogger("wolf_trader.comando_telegram")

_BASE_URL = "https://api.telegram.org/bot{token}"


def _envf(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


class TipoComando(str, Enum):
    """Comandos operacionais reconhecidos."""
    PAUSAR = "PAUSAR"
    RETOMAR = "RETOMAR"
    AGRESSIVO = "AGRESSIVO"
    CONSERVADOR = "CONSERVADOR"
    STATUS = "STATUS"
    BANCA = "BANCA"


# Palavras de direção para o sinal político do Comandante (PT + EN).
_LEX_POS = {
    "sobe", "subir", "sobem", "alta", "otimista", "otimismo", "comprar", "compra",
    "bull", "positivo", "favoravel", "favorável", "ganha", "ganhar", "vence",
    "vencer", "cresce", "crescer", "up", "sim", "yes", "aprova", "aprovar",
}
_LEX_NEG = {
    "cai", "cair", "caem", "baixa", "queda", "pessimista", "vender", "venda",
    "bear", "negativo", "desfavoravel", "desfavorável", "perde", "perder",
    "crise", "risco", "down", "nao", "não", "no", "rejeita", "rejeitar",
    "despenca", "despencar",
}

_TOKEN_RE = re.compile(r"[a-zà-ú]+", re.IGNORECASE)


@dataclass
class SinalComandante:
    """Leitura política enviada pelo Comandante (vira Sinal linha=P)."""
    texto: str
    direcao: float          # -1 .. +1
    conviccao: float        # 0 .. 1 (alta por padrão — voz humana da banca)
    recebido_em: float      # epoch seconds
    autor_chat_id: str = ""

    def idade_s(self, agora: Optional[float] = None) -> float:
        return max(0.0, (agora if agora is not None else time.time()) - self.recebido_em)


@dataclass
class ComandoOperacional:
    """Comando operacional do Comandante (pausar/agressivo/status/...)."""
    tipo: TipoComando
    argumento: str = ""
    recebido_em: float = field(default_factory=time.time)


@dataclass
class LeituraTelegram:
    """Resultado de um ciclo de polling."""
    sinais: list[SinalComandante] = field(default_factory=list)
    comandos: list[ComandoOperacional] = field(default_factory=list)
    novo_offset: Optional[int] = None


@dataclass
class ConfigComando:
    """Constantes calibráveis do input do Comandante (via env)."""
    # Convicção base do sinal do Comandante — alta, pois é a voz humana da banca,
    # mas < 1.0: continua sujeita ao OVERRIDE TÉCNICO e à decadência de Curie.
    conviccao_comandante: float = field(
        default_factory=lambda: _envf("WOLF_COMANDANTE_CONVICCAO", 0.85))
    # Só aceita inputs do chat do Comandante (segurança).
    commander_chat_id: str = field(
        default_factory=lambda: os.environ.get("TELEGRAM_COMMANDER_CHAT_ID", ""))
    timeout_s: float = field(
        default_factory=lambda: _envf("WOLF_TELEGRAM_POLL_TIMEOUT_S", 10.0))


class OuvinteTelegram:
    """Faz polling getUpdates e parseia inputs do Comandante.

    O offset é mantido em memória (o runner guarda a instância). Cada update é
    consumido uma única vez. Injeção de `fetch` para teste sem rede.
    """

    def __init__(
        self,
        config: Optional[ConfigComando] = None,
        *,
        bot_token: Optional[str] = None,
        fetch: Optional[Callable[[str, dict, float], dict]] = None,
    ) -> None:
        self.cfg = config or ConfigComando()
        self._token = bot_token or os.environ.get("TELEGRAM_BOT_TOKEN", "")
        self._base = _BASE_URL.format(token=self._token)
        self._offset: Optional[int] = None
        self._fetch = fetch or self._fetch_updates

    # -- rede ----------------------------------------------------------------
    def _fetch_updates(self, url: str, params: dict, timeout: float) -> dict:
        resp = requests.get(url, params=params, timeout=timeout)
        resp.raise_for_status()
        return resp.json()

    def poll(self) -> LeituraTelegram:
        """Busca updates novos e devolve sinais + comandos do Comandante."""
        if not self._token:
            logger.debug("Sem TELEGRAM_BOT_TOKEN — polling desativado.")
            return LeituraTelegram()
        url = f"{self._base}/getUpdates"
        params: dict[str, Any] = {"timeout": 0}
        if self._offset is not None:
            params["offset"] = self._offset
        try:
            data = self._fetch(url, params, self.cfg.timeout_s)
        except Exception as e:  # noqa: BLE001 — polling nunca derruba o robô
            logger.warning("Falha no getUpdates do Telegram: %s", e)
            return LeituraTelegram()
        if not data.get("ok"):
            logger.warning("getUpdates retornou ok=false: %s", data.get("description"))
            return LeituraTelegram()
        return self._processar(data.get("result", []))

    def _processar(self, updates: list[dict]) -> LeituraTelegram:
        leitura = LeituraTelegram()
        maior_update_id: Optional[int] = None
        for up in updates:
            uid = up.get("update_id")
            if isinstance(uid, int):
                maior_update_id = uid if maior_update_id is None else max(maior_update_id, uid)
            msg = up.get("message") or up.get("edited_message") or {}
            chat_id = str((msg.get("chat") or {}).get("id", ""))
            texto = (msg.get("text") or "").strip()
            if not texto:
                continue
            # Segurança: só aceita o chat do Comandante (se configurado).
            if self.cfg.commander_chat_id and chat_id != self.cfg.commander_chat_id:
                logger.info("Ignorando input de chat não autorizado: %s", chat_id)
                continue
            comando = interpretar_comando(texto)
            if comando is not None:
                leitura.comandos.append(comando)
                continue
            sinal = interpretar_sinal(texto, self.cfg.conviccao_comandante, chat_id)
            if sinal is not None:
                leitura.sinais.append(sinal)
        if maior_update_id is not None:
            self._offset = maior_update_id + 1
            leitura.novo_offset = self._offset
        return leitura


# ---------------------------------------------------------------------------
# Parsing puro (sem rede) — testável isoladamente.
# ---------------------------------------------------------------------------
_COMANDOS_MAP = {
    "pausar": TipoComando.PAUSAR, "pause": TipoComando.PAUSAR, "parar": TipoComando.PAUSAR,
    "stop": TipoComando.PAUSAR,
    "retomar": TipoComando.RETOMAR, "resume": TipoComando.RETOMAR, "start": TipoComando.RETOMAR,
    "continuar": TipoComando.RETOMAR,
    "agressivo": TipoComando.AGRESSIVO, "aggressive": TipoComando.AGRESSIVO,
    "conservador": TipoComando.CONSERVADOR, "conservative": TipoComando.CONSERVADOR,
    "status": TipoComando.STATUS, "report": TipoComando.STATUS, "relatorio": TipoComando.STATUS,
    "relatório": TipoComando.STATUS,
    "banca": TipoComando.BANCA, "panorama": TipoComando.BANCA, "politica": TipoComando.BANCA,
}


def interpretar_comando(texto: str) -> Optional[ComandoOperacional]:
    """Reconhece comandos operacionais (com ou sem barra). None se não for."""
    t = texto.strip().lstrip("/").lower()
    if not t:
        return None
    primeira = t.split()[0]
    tipo = _COMANDOS_MAP.get(primeira)
    if tipo is None:
        return None
    argumento = t[len(primeira):].strip()
    return ComandoOperacional(tipo=tipo, argumento=argumento)


def interpretar_sinal(
    texto: str, conviccao: float, chat_id: str = ""
) -> Optional[SinalComandante]:
    """Converte texto livre do Comandante em direção política (léxico PT/EN).

    Retorna None se o texto não tiver nenhuma palavra direcional (evita ruído).
    A convicção é alta (voz humana da banca) mas permanece < 1 e sujeita a
    Curie/override — nunca zera a doutrina técnica.
    """
    toks = [t.lower() for t in _TOKEN_RE.findall(texto)]
    if not toks:
        return None
    pos = sum(1 for t in toks if t in _LEX_POS)
    neg = sum(1 for t in toks if t in _LEX_NEG)
    total = pos + neg
    if total == 0:
        return None
    direcao = (pos - neg) / total
    # Convicção escala levemente com quão enfático foi (mais palavras direcionais),
    # mas fica ancorada na convicção base do Comandante.
    enfase = min(1.0, total / 3.0)
    conv = min(0.95, conviccao * (0.85 + 0.15 * enfase))
    return SinalComandante(
        texto=texto.strip()[:200],
        direcao=direcao,
        conviccao=conv,
        recebido_em=time.time(),
        autor_chat_id=chat_id,
    )
