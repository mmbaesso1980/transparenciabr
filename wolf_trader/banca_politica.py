"""Banca Política — panorama macro-político de fontes públicas grátis rastreáveis.

Comandante Baesso pediu uma banca com os cinco maiores analistas políticos do
mundo lendo as notícias diárias e fornecendo panoramas aos mestres. Aqui a banca
NÃO é decorativa: é um pipeline determinístico e honesto que

  1. COLETA manchetes de fontes PÚBLICAS, GRÁTIS e RASTREÁVEIS (RSS — Reuters via
     Google News RSS, Associated Press, agências). Nenhuma API paga. Sem mock:
     se a rede falhar, o vetor fica neutro e o motivo é registrado.

  2. MEDE sentimento/direção de cada manchete por léxico determinístico (sem
     alucinação de LLM no caminho crítico). Vertex/Gemini é REFORÇO opcional,
     acionado só quando a VM está sob pressão (>80% uso) — ver runner.

  3. PONDERA através de 5 personas de analistas políticos reais, cada uma um
     VIÉS METODOLÓGICO matemático distinto (não citações):

       - Nate Silver   (FiveThirtyEight): agregação bayesiana, pondera pelo
                        volume de evidência; desconfia de manchete isolada.
       - Larry Sabato  (UVA Center for Politics): institucionalista, dá peso a
                        fundamentos estruturais; suaviza ruído de curto prazo.
       - John Zogby    (pollster): sensível a momentum de opinião pública;
                        amplifica sinais recentes e coerentes.
       - Frank Luntz   (linguista/framing): lê a INTENSIDADE da linguagem; peso
                        maior quando o vocabulário é forte/polarizado.
       - Nate Cohn     (NYT Upshot): cético calibrado, aplica encolhimento
                        (shrinkage) para o neutro; corta exageros.

  4. PRODUZ um vetor P (direção em [-1,1] + convicção em [0,1]) com timestamp,
     cacheado em disco. Recalculado a cada 6h (o "relógio lento"). Entre
     atualizações, o runner soma esse P aos sinais técnicos de cada ciclo 15s e
     deixa a doutrina CURIE decair sua convicção com a idade.

O vetor é um PANORAMA agregado (clima político geral), não uma aposta em mercado
específico. Ele entra como um sinal da linha P (POLÍTICA) na doutrina WOLF, onde
o OVERRIDE TÉCNICO ainda pode rebaixá-lo — a técnica de mercado manda.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Callable, Optional

import requests

logger = logging.getLogger("wolf_trader.banca_politica")

# User-Agent honesto e rastreável (padrão do projeto para coletores públicos).
_USER_AGENT = "TransparenciaBR-engines/1.0 (WOLF banca politica; contato@transparenciabr.com.br)"

# Fontes públicas, grátis e rastreáveis. Google News RSS agrega Reuters/AP/etc.
# sem chave. Cada URL é auditável e retorna XML padrão RSS.
FONTES_PADRAO: list[tuple[str, str]] = [
    ("reuters_world", "https://news.google.com/rss/search?q=when:24h+reuters+politics&hl=en-US&gl=US&ceid=US:en"),
    ("ap_politics", "https://news.google.com/rss/search?q=when:24h+associated+press+politics&hl=en-US&gl=US&ceid=US:en"),
    ("us_election", "https://news.google.com/rss/search?q=when:24h+US+election+OR+congress+OR+senate&hl=en-US&gl=US&ceid=US:en"),
    ("markets_policy", "https://news.google.com/rss/search?q=when:24h+fed+OR+inflation+OR+economy+policy&hl=en-US&gl=US&ceid=US:en"),
]


def _envf(key: str, default: float) -> float:
    try:
        return float(os.environ.get(key, str(default)))
    except (TypeError, ValueError):
        return default


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


# ---------------------------------------------------------------------------
# Léxico determinístico de direção. Positivo = clima de alta/estabilidade/
# continuidade (risk-on); negativo = crise/queda/incerteza (risk-off).
# É um proxy honesto do "tom" das manchetes, não um oráculo. Palavras em EN
# porque as fontes agregadas são majoritariamente internacionais.
# ---------------------------------------------------------------------------
LEXICO_POS = {
    "win", "wins", "winning", "lead", "leads", "leading", "surge", "surges",
    "rally", "rallies", "gain", "gains", "rise", "rises", "boost", "approve",
    "approves", "approved", "deal", "agreement", "recover", "recovery", "growth",
    "strong", "record", "optimism", "confidence", "support", "supports",
    "victory", "advance", "advances", "stability", "stabilize", "ease", "eases",
}
LEXICO_NEG = {
    "loss", "lose", "loses", "losing", "fall", "falls", "falling", "drop",
    "drops", "plunge", "plunges", "crash", "crisis", "collapse", "decline",
    "declines", "fear", "fears", "risk", "risks", "threat", "threats", "war",
    "conflict", "scandal", "probe", "shutdown", "recession", "slump", "turmoil",
    "uncertainty", "downgrade", "reject", "rejects", "protest", "protests",
    "sanction", "sanctions", "resign", "resigns", "weak", "warning", "warns",
}
# Palavras de INTENSIDADE (para o analista Luntz — framing/força da linguagem).
LEXICO_INTENSO = {
    "crisis", "crash", "collapse", "war", "scandal", "record", "surge", "plunge",
    "historic", "unprecedented", "shock", "emergency", "landslide", "massive",
}

_TOKEN_RE = re.compile(r"[a-z]+")


@dataclass
class Manchete:
    """Uma manchete coletada de fonte pública."""
    fonte: str
    titulo: str
    link: str = ""

    def tokens(self) -> list[str]:
        return _TOKEN_RE.findall(self.titulo.lower())


@dataclass
class VetorPolitico:
    """Panorama político agregado — sinal da linha P (POLÍTICA)."""
    direcao: float          # -1 (risk-off) .. +1 (risk-on)
    conviccao: float        # 0 .. 1
    gerado_em: float        # epoch seconds (time.time)
    n_manchetes: int
    resumo: str             # panorama textual curto para o report Telegram
    por_analista: dict[str, float] = field(default_factory=dict)
    fonte_reforco: str = "lexico"   # "lexico" ou "vertex" (quando reforçado)

    def idade_s(self, agora: Optional[float] = None) -> float:
        return max(0.0, (agora if agora is not None else time.time()) - self.gerado_em)

    def to_dict(self) -> dict:
        return {
            "direcao": self.direcao,
            "conviccao": self.conviccao,
            "gerado_em": self.gerado_em,
            "n_manchetes": self.n_manchetes,
            "resumo": self.resumo,
            "por_analista": self.por_analista,
            "fonte_reforco": self.fonte_reforco,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "VetorPolitico":
        return cls(
            direcao=float(d.get("direcao", 0.0)),
            conviccao=float(d.get("conviccao", 0.0)),
            gerado_em=float(d.get("gerado_em", 0.0)),
            n_manchetes=int(d.get("n_manchetes", 0)),
            resumo=str(d.get("resumo", "")),
            por_analista=dict(d.get("por_analista", {})),
            fonte_reforco=str(d.get("fonte_reforco", "lexico")),
        )

    @classmethod
    def neutro(cls, motivo: str = "sem dados") -> "VetorPolitico":
        return cls(
            direcao=0.0, conviccao=0.0, gerado_em=time.time(),
            n_manchetes=0, resumo=f"Panorama neutro ({motivo}).",
        )


# ---------------------------------------------------------------------------
# Coleta de manchetes (RSS público). Sem mock: falha vira lista vazia + log.
# ---------------------------------------------------------------------------
def coletar_manchetes(
    fontes: Optional[list[tuple[str, str]]] = None,
    *,
    timeout: float = 15.0,
    max_por_fonte: int = 25,
    fetch: Optional[Callable[[str, float], Optional[str]]] = None,
) -> list[Manchete]:
    """Busca manchetes de feeds RSS públicos.

    `fetch(url, timeout) -> xml_str | None` é injetável para teste (sem rede).
    Em produção usa requests com User-Agent rastreável do projeto.
    """
    fontes = fontes or FONTES_PADRAO
    fetch = fetch or _fetch_rss
    manchetes: list[Manchete] = []
    for nome, url in fontes:
        try:
            xml = fetch(url, timeout)
            if not xml:
                logger.warning("Fonte '%s' sem conteúdo.", nome)
                continue
            manchetes.extend(_parse_rss(xml, nome)[:max_por_fonte])
        except Exception as e:  # noqa: BLE001 — coleta nunca derruba o robô
            logger.warning("Falha ao coletar fonte '%s': %s", nome, e)
    logger.info("Banca política coletou %d manchetes de %d fontes.",
                len(manchetes), len(fontes))
    return manchetes


def _fetch_rss(url: str, timeout: float) -> Optional[str]:
    resp = requests.get(url, headers={"User-Agent": _USER_AGENT}, timeout=timeout)
    resp.raise_for_status()
    return resp.text


def _parse_rss(xml: str, fonte: str) -> list[Manchete]:
    """Parse tolerante de RSS 2.0 (item/title/link)."""
    out: list[Manchete] = []
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as e:
        logger.warning("XML inválido da fonte '%s': %s", fonte, e)
        return out
    for item in root.iter("item"):
        titulo_el = item.find("title")
        link_el = item.find("link")
        titulo = (titulo_el.text or "").strip() if titulo_el is not None else ""
        link = (link_el.text or "").strip() if link_el is not None else ""
        if titulo:
            out.append(Manchete(fonte=fonte, titulo=titulo, link=link))
    return out


# ---------------------------------------------------------------------------
# Sentimento determinístico por manchete.
# ---------------------------------------------------------------------------
def _sentimento_manchete(m: Manchete) -> tuple[float, float]:
    """Retorna (direcao[-1,1], intensidade[0,1]) da manchete.

    direcao = (pos - neg) / (pos + neg) ; intensidade = fração de palavras fortes.
    """
    toks = m.tokens()
    if not toks:
        return 0.0, 0.0
    pos = sum(1 for t in toks if t in LEXICO_POS)
    neg = sum(1 for t in toks if t in LEXICO_NEG)
    intenso = sum(1 for t in toks if t in LEXICO_INTENSO)
    total = pos + neg
    direcao = 0.0 if total == 0 else (pos - neg) / total
    intensidade = _clamp(intenso / max(1, len(toks)) * 4.0, 0.0, 1.0)
    return direcao, intensidade


# ---------------------------------------------------------------------------
# A BANCA — cinco analistas como funções matemáticas de viés metodológico.
# Cada analista recebe as medições agregadas e devolve uma direção ponderada.
# ---------------------------------------------------------------------------
@dataclass
class ConfigBanca:
    """Constantes calibráveis da banca (via env)."""
    # Silver: expoente de confiança-por-volume (satura com muitas manchetes).
    silver_k_volume: float = field(
        default_factory=lambda: _envf("WOLF_BANCA_SILVER_K", 20.0))
    # Sabato: fator de suavização institucional (puxa para a média histórica 0).
    sabato_suavizacao: float = field(
        default_factory=lambda: _envf("WOLF_BANCA_SABATO_SUAV", 0.6))
    # Zogby: ganho de momentum de opinião (amplifica direção coerente).
    zogby_ganho: float = field(
        default_factory=lambda: _envf("WOLF_BANCA_ZOGBY_GANHO", 1.3))
    # Luntz: peso da intensidade linguística na direção.
    luntz_peso_intensidade: float = field(
        default_factory=lambda: _envf("WOLF_BANCA_LUNTZ_PESO", 0.5))
    # Cohn: shrinkage cético (encolhe direção para o neutro).
    cohn_shrinkage: float = field(
        default_factory=lambda: _envf("WOLF_BANCA_COHN_SHRINK", 0.7))
    # Convicção máxima que a banca pode emitir (humildade — política é ruidosa).
    conviccao_max: float = field(
        default_factory=lambda: _envf("WOLF_BANCA_CONVICCAO_MAX", 0.65))
    # Mínimo de manchetes para a banca ter qualquer convicção.
    min_manchetes: int = field(
        default_factory=lambda: int(os.environ.get("WOLF_BANCA_MIN_MANCHETES", "3")))


class BancaPolitica:
    """Agrega manchetes públicas em um vetor político via cinco analistas."""

    ANALISTAS = ["silver", "sabato", "zogby", "luntz", "cohn"]

    def __init__(self, config: Optional[ConfigBanca] = None) -> None:
        self.cfg = config or ConfigBanca()

    # -- Silver: agregação bayesiana, confiança cresce com volume ------------
    def silver(self, dir_medio: float, n: int) -> float:
        conf = 1.0 - math.exp(-n / max(1e-6, self.cfg.silver_k_volume))
        return dir_medio * conf

    # -- Sabato: institucionalista, suaviza ruído de curto prazo -------------
    def sabato(self, dir_medio: float) -> float:
        return dir_medio * (1.0 - self.cfg.sabato_suavizacao)

    # -- Zogby: momentum de opinião, amplifica direção coerente --------------
    def zogby(self, dir_medio: float, coerencia: float) -> float:
        return _clamp(dir_medio * (1.0 + self.cfg.zogby_ganho * coerencia), -1.0, 1.0)

    # -- Luntz: framing, mistura direção com intensidade da linguagem --------
    def luntz(self, dir_medio: float, intensidade_media: float) -> float:
        realce = 1.0 + self.cfg.luntz_peso_intensidade * intensidade_media
        return _clamp(dir_medio * realce, -1.0, 1.0)

    # -- Cohn: cético calibrado, encolhe para o neutro -----------------------
    def cohn(self, dir_medio: float) -> float:
        return dir_medio * (1.0 - self.cfg.cohn_shrinkage)

    def avaliar(self, manchetes: list[Manchete]) -> VetorPolitico:
        """Produz o VetorPolitico agregado a partir das manchetes coletadas."""
        validas = [m for m in manchetes if m.titulo]
        n = len(validas)
        if n < self.cfg.min_manchetes:
            return VetorPolitico.neutro(
                motivo=f"apenas {n} manchete(s), mínimo {self.cfg.min_manchetes}")

        dirs, intens = zip(*(_sentimento_manchete(m) for m in validas))
        dir_medio = sum(dirs) / n
        intensidade_media = sum(intens) / n
        # Coerência: quão alinhadas as manchetes estão (1 = todas mesma direção).
        nao_neutras = [d for d in dirs if d != 0.0]
        if nao_neutras:
            mesma = max(
                sum(1 for d in nao_neutras if d > 0),
                sum(1 for d in nao_neutras if d < 0),
            )
            coerencia = mesma / len(nao_neutras)
        else:
            coerencia = 0.0

        votos = {
            "silver": self.silver(dir_medio, n),
            "sabato": self.sabato(dir_medio),
            "zogby": self.zogby(dir_medio, coerencia),
            "luntz": self.luntz(dir_medio, intensidade_media),
            "cohn": self.cohn(dir_medio),
        }
        direcao = _clamp(sum(votos.values()) / len(votos), -1.0, 1.0)

        # Convicção: magnitude da direção agregada * coerência * saturação de
        # volume (Silver), tudo limitado pelo teto humilde da banca.
        conf_volume = 1.0 - math.exp(-n / max(1e-6, self.cfg.silver_k_volume))
        conviccao = _clamp(
            abs(direcao) * (0.5 + 0.5 * coerencia) * conf_volume,
            0.0, self.cfg.conviccao_max,
        )

        resumo = self._resumo(direcao, conviccao, n, validas)
        return VetorPolitico(
            direcao=direcao,
            conviccao=conviccao,
            gerado_em=time.time(),
            n_manchetes=n,
            resumo=resumo,
            por_analista={k: round(v, 4) for k, v in votos.items()},
        )

    def _resumo(self, direcao: float, conviccao: float, n: int,
                manchetes: list[Manchete]) -> str:
        if direcao > 0.15:
            clima = "clima político-econômico favorável (risk-on)"
        elif direcao < -0.15:
            clima = "clima de cautela/incerteza (risk-off)"
        else:
            clima = "clima político-econômico neutro"
        exemplos = "; ".join(m.titulo[:90] for m in manchetes[:3])
        return (
            f"{clima} — direção {direcao:+.2f}, convicção {conviccao:.0%} "
            f"sobre {n} manchetes. Destaques: {exemplos}"
        )


# ---------------------------------------------------------------------------
# Cache em disco do vetor político (o "relógio lento" de 6h).
# ---------------------------------------------------------------------------
def caminho_cache() -> str:
    return os.environ.get(
        "WOLF_BANCA_CACHE", "/tmp/wolf_banca_politica.json")


def carregar_cache(caminho: Optional[str] = None) -> Optional[VetorPolitico]:
    caminho = caminho or caminho_cache()
    try:
        with open(caminho, "r", encoding="utf-8") as fh:
            return VetorPolitico.from_dict(json.load(fh))
    except (FileNotFoundError, json.JSONDecodeError, ValueError) as e:
        logger.info("Cache da banca ausente/inválido (%s).", e)
        return None


def salvar_cache(vetor: VetorPolitico, caminho: Optional[str] = None) -> None:
    caminho = caminho or caminho_cache()
    tmp = f"{caminho}.tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(vetor.to_dict(), fh, ensure_ascii=False)
    os.replace(tmp, caminho)


def atualizar_panorama(
    banca: Optional[BancaPolitica] = None,
    *,
    fontes: Optional[list[tuple[str, str]]] = None,
    fetch: Optional[Callable[[str, float], Optional[str]]] = None,
    caminho: Optional[str] = None,
) -> VetorPolitico:
    """Coleta -> avalia -> persiste. Chamado pelo relógio lento (6h)."""
    banca = banca or BancaPolitica()
    manchetes = coletar_manchetes(fontes=fontes, fetch=fetch)
    vetor = banca.avaliar(manchetes)
    try:
        salvar_cache(vetor, caminho)
    except OSError as e:  # noqa: BLE001
        logger.warning("Não foi possível salvar cache da banca: %s", e)
    return vetor
