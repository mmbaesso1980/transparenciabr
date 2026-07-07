"""
Cliente Polymarket CLOB para o motor WOLF (projeto TransparenciaBR/AURORA).

Chain 137 (Polygon). Host CLOB: https://clob.polymarket.com
Autenticacao em dois niveis (doc oficial):
  - L1: assinatura EIP-712 com a CHAVE PRIVADA -> deriva credenciais de API.
  - L2: HMAC-SHA256 com (api_key, secret, passphrase) -> operacoes de trade.

Ref: https://docs.polymarket.com/developers/CLOB/introduction

LEIS DO PROJETO respeitadas:
  - EXEC-011: nenhuma credencial hardcoded. A chave privada L1 vem do Secret
    Manager (idealmente envelopada por KMS) e so e materializada em memoria no
    instante de assinar. NUNCA e logada nem persistida em texto claro.
  - Regra 9: se um dado de mercado nao vier confiavel, retorna None ("sem dado").
  - Execucao com freios: dimensionamento e gate de valor sao aplicados na camada
    WOLF (wolf_trader.engine), nao aqui. Este modulo apenas le e, quando chamado,
    monta/posta a ordem ja aprovada.

DEPENDENCIAS DE ASSINATURA:
  A assinatura L1/L2 real depende do SDK oficial (py-clob-client) e de libs web3.
  Para manter o pacote leve e testavel, este modulo define uma INTERFACE de
  assinatura (`Signer`) e usa o SDK oficial quando presente. A leitura de mercados
  usa apenas HTTP publico (requests) e nao exige chave.
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Callable, Optional

import requests

logger = logging.getLogger("wolf_trader.polymarket")

CLOB_HOST = os.environ.get("POLYMARKET_CLOB_HOST", "https://clob.polymarket.com")
GAMMA_HOST = os.environ.get("POLYMARKET_GAMMA_HOST", "https://gamma-api.polymarket.com")
CHAIN_ID = 137  # Polygon (fixo, conforme doc CLOB)
HTTP_TIMEOUT = int(os.environ.get("POLYMARKET_TIMEOUT_S", "30"))


# ---------------------------------------------------------------------------
# Modelos leves
# ---------------------------------------------------------------------------
@dataclass
class Mercado:
    condition_id: str
    pergunta: str
    ativo: bool
    tokens: list[str]           # token_ids ja normalizados (list[str])
    tags: list[str]


def _parse_token_ids(raw: Any) -> list[str]:
    """Normaliza o campo de tokens da Gamma API para uma lista limpa de token_ids.

    A Gamma API e inconsistente entre endpoints/versoes. Este helper cobre os
    formatos observados em producao, sem NUNCA iterar caractere-a-caractere
    (bug que gerava 404 em token_id='[', '\"', '7', etc.):

      1. `clobTokenIds` como STRING JSON: '["7212...","9987..."]'  -> json.loads
      2. `tokens` como lista de DICTS: [{"token_id": "...", "outcome": "Yes"}]
      3. lista de STRINGS ja parseada: ["7212...", "9987..."]
      4. valor unico string de token_id (sem colchetes) -> [valor]

    Regra 9 (transparenciabr-lei): dado nao confiavel -> ignora (nao inventa).
    """
    if raw is None:
        return []

    # (1)/(4) String: tentar decodificar JSON; senao tratar como token_id unico.
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return []
        if s[0] in "[{":
            try:
                raw = json.loads(s)
            except (ValueError, TypeError):
                return []
        else:
            # token_id solto (nao e estrutura JSON) — aceita como unico id.
            return [s]

    # dict isolado -> extrai o id dele
    if isinstance(raw, dict):
        raw = [raw]

    if not isinstance(raw, (list, tuple)):
        return []

    out: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            tid = item.get("token_id") or item.get("tokenId") or item.get("id")
            if tid:
                out.append(str(tid))
        elif isinstance(item, str):
            tid = item.strip()
            # descarta ruido de string mal-parseada (colchetes, aspas, virgulas)
            if tid and tid not in "[]{}\",":
                out.append(tid)
        elif isinstance(item, (int,)):
            out.append(str(item))
    return out


@dataclass
class Cotacao:
    token_id: str
    bid: Optional[float]
    ask: Optional[float]
    mid: Optional[float]        # None => sem dado confiavel (regra 9)


# ---------------------------------------------------------------------------
# Leitura publica (sem chave) — mercados e precos
# ---------------------------------------------------------------------------
class PolymarketReader:
    """Leitura de mercados e precos. Nao requer credencial (endpoints publicos)."""

    def __init__(self, clob_host: str = CLOB_HOST, gamma_host: str = GAMMA_HOST,
                 session: Optional[requests.Session] = None):
        self.clob = clob_host.rstrip("/")
        self.gamma = gamma_host.rstrip("/")
        self.s = session or requests.Session()
        self.s.headers.update({"User-Agent": "TransparenciaBR-engines/1.0"})

    def _get(self, url: str, params: dict | None = None) -> Any:
        r = self.s.get(url, params=params, timeout=HTTP_TIMEOUT)
        r.raise_for_status()
        return r.json()

    def listar_mercados(self, ativos: bool = True, limit: int = 100,
                        tag: str | None = None) -> list[Mercado]:
        """Lista mercados via Gamma API. Retorna [] em caso de resposta vazia."""
        params: dict[str, Any] = {"limit": limit, "closed": "false" if ativos else "true"}
        if tag:
            params["tag"] = tag
        try:
            data = self._get(f"{self.gamma}/markets", params=params)
        except requests.RequestException as e:
            logger.warning("Falha ao listar mercados: %s", e)
            return []
        itens = data if isinstance(data, list) else data.get("data", [])
        out: list[Mercado] = []
        for m in itens:
            token_ids = _parse_token_ids(m.get("tokens"))
            if not token_ids:
                token_ids = _parse_token_ids(m.get("clobTokenIds"))
            out.append(Mercado(
                condition_id=str(m.get("conditionId") or m.get("condition_id") or ""),
                pergunta=str(m.get("question") or m.get("title") or ""),
                ativo=not bool(m.get("closed", False)),
                tokens=token_ids,
                tags=[str(t) for t in (m.get("tags") or [])],
            ))
        return out

    def cotacao(self, token_id: str) -> Cotacao:
        """
        Preco mid de um token de outcome. Se o book nao vier confiavel,
        retorna mid=None (regra 9: sem dado -> sem convccao).
        """
        try:
            book = self._get(f"{self.clob}/book", params={"token_id": token_id})
        except requests.RequestException as e:
            logger.warning("Falha no book de %s: %s", token_id, e)
            return Cotacao(token_id, None, None, None)

        def _best(side: str) -> Optional[float]:
            # O book da Polymarket retorna niveis do PIOR para o MELHOR preco:
            #  - bids em ordem CRESCENTE  -> melhor bid = MAIOR preco
            #  - asks em ordem DECRESCENTE -> melhor ask = MENOR preco
            # Pegar arr[0] cravava bid=0.01 e ask=0.99 => mid=0.500 FALSO (bug).
            # Selecionamos por max/min sobre os precos, robusto a ordenacao.
            arr = book.get(side) or []
            precos = []
            for lvl in arr:
                try:
                    precos.append(float(lvl.get("price")))
                except (TypeError, ValueError, AttributeError):
                    continue
            if not precos:
                return None
            return max(precos) if side == "bids" else min(precos)

        bid = _best("bids")
        ask = _best("asks")
        mid = (bid + ask) / 2 if (bid is not None and ask is not None) else None
        return Cotacao(token_id, bid, ask, mid)


# ---------------------------------------------------------------------------
# Assinatura / trading (requer chave — vinda do cofre, nunca hardcoded)
# ---------------------------------------------------------------------------
class Signer:
    """
    Interface de assinatura. A implementacao concreta usa o SDK oficial
    (py-clob-client) e a chave privada L1 lida do Secret Manager em memoria.

    `private_key_provider` e um callable que devolve a chave privada APENAS
    quando chamado (lazy). O cliente NAO e cacheado para evitar que a chave
    persista em memoria alem do necessario (ClobClient armazena a PK
    internamente). Cada chamada cria um novo ClobClient e o descarta apos uso.
    """

    def __init__(self, private_key_provider: Callable[[], str],
                 funder_address: str, signature_type: int = 3):
        self._pk_provider = private_key_provider
        self.funder_address = funder_address
        self.signature_type = signature_type  # 0 EOA, 1 Proxy, 2 Safe, 3 POLY_1271

    def _create_client(self):
        """Cria cliente CLOB efemero (sem cache) para minimizar exposicao da PK.

        Polymarket migrou para CLOB V2 (hard cutover em 2026-04-28). O pacote
        legado `py-clob-client` (v1) foi arquivado e suas ordens sao rejeitadas
        em producao com `order_version_mismatch` / `invalid order version`.
        A partir daqui usamos `py-clob-client-v2`; mantemos fallback para o v1
        apenas para ambientes/testes legados.
        Ref: https://docs.polymarket.com/v2-migration
        """
        pk = self._pk_provider()
        try:
            # Caminho oficial atual: CLOB V2
            from py_clob_client_v2 import ClobClient  # type: ignore
            client = ClobClient(
                host=CLOB_HOST, chain_id=CHAIN_ID, key=pk,
                signature_type=self.signature_type, funder=self.funder_address,
                use_server_time=True,   # evita rejeicao por clock skew (EIP-712)
                retry_on_error=True,    # re-resolve versao do CLOB e tenta de novo
            )
            creds = client.create_or_derive_api_key()
            client = ClobClient(
                host=CLOB_HOST, chain_id=CHAIN_ID, key=pk, creds=creds,
                signature_type=self.signature_type, funder=self.funder_address,
                use_server_time=True, retry_on_error=True,
            )
            del pk
            self._sdk_version = 2
            return client
        except ImportError:
            pass
        # Fallback legado (v1) — nao funciona em producao pos-cutover, so testes.
        try:
            from py_clob_client.client import ClobClient as ClobClientV1  # type: ignore
        except ImportError as e:  # pragma: no cover
            del pk
            raise RuntimeError(
                "Nenhum SDK CLOB instalado. Adicione 'py-clob-client-v2' ao "
                "requirements da VM wolf-trader para habilitar execucao real."
            ) from e
        client = ClobClientV1(
            host=CLOB_HOST, chain_id=CHAIN_ID, key=pk,
            signature_type=self.signature_type, funder=self.funder_address,
        )
        client.set_api_creds(client.create_or_derive_api_creds())
        del pk
        self._sdk_version = 1
        return client


@dataclass
class OrdemRequest:
    token_id: str
    lado: str            # "BUY" | "SELL"
    preco: float         # 0..1 (probabilidade)
    size: float          # em shares
    tipo: str = "GTC"    # GTC | FOK | GTD


@dataclass
class OrdemResultado:
    ok: bool
    order_id: Optional[str]
    detalhe: str


class PolymarketTrader:
    """
    Camada de EXECUCAO. Recebe ordens JA aprovadas pela camada WOLF (com gate de
    valor e limites de risco aplicados). Nao decide nada sozinha.
    """

    def __init__(self, signer: Signer, dry_run: bool = True):
        self.signer = signer
        # dry_run=True por padrao: seguranca. Deploy real seta DRY_RUN=false.
        self.dry_run = dry_run

    def postar_ordem(self, req: OrdemRequest) -> OrdemResultado:
        if not (0.0 < req.preco < 1.0):
            return OrdemResultado(False, None, f"preco fora de faixa: {req.preco}")
        if req.size <= 0:
            return OrdemResultado(False, None, f"size invalido: {req.size}")
        if self.dry_run:
            logger.info("[DRY_RUN] Ordem NAO enviada: %s", req)
            return OrdemResultado(True, None, f"DRY_RUN ok (nao enviou): {req.lado} "
                                              f"{req.size}@{req.preco} tok={req.token_id[:10]}...")
        client = self.signer._create_client()
        sdk = getattr(self.signer, "_sdk_version", 1)
        try:
            if sdk == 2:
                # CLOB V2: neg_risk e tick_size resolvidos pelo proprio client.
                from py_clob_client_v2 import (  # type: ignore
                    OrderArgs, OrderType, PartialCreateOrderOptions, Side,
                )
                neg_risk = client.get_neg_risk(req.token_id)
                tick = client.get_tick_size(req.token_id)
                lado = Side.BUY if req.lado.upper() == "BUY" else Side.SELL
                otype = getattr(OrderType, req.tipo, OrderType.GTC)
                args = OrderArgs(token_id=req.token_id, price=req.preco,
                                 size=req.size, side=lado)
                opts = PartialCreateOrderOptions(tick_size=tick, neg_risk=neg_risk)
                resp = client.create_and_post_order(args, opts, otype)
            else:
                # Fallback legado v1 (nao funciona em producao pos-cutover).
                from py_clob_client.clob_types import OrderArgs  # type: ignore
                args = OrderArgs(token_id=req.token_id, price=req.preco,
                                 size=req.size, side=req.lado)
                signed = client.create_order(args)
                resp = client.post_order(signed, req.tipo)
            resp = resp if isinstance(resp, dict) else getattr(resp, "__dict__", {}) or {}
            oid = str(resp.get("orderID") or resp.get("order_id") or resp.get("id") or "")
            return OrdemResultado(bool(oid), oid or None, f"ordem enviada: {oid or 'sem id'}")
        except Exception as e:  # noqa: BLE001
            logger.exception("Falha ao postar ordem")
            return OrdemResultado(False, None, f"erro ao postar: {e}")


def secret_manager_pk_provider(secret_name: str, project: str) -> Callable[[], str]:
    """
    Fabrica um provider que le a chave privada do Secret Manager no momento do uso.
    Nunca guarda a chave em variavel de modulo. EXEC-011.
    """
    def _provider() -> str:
        from google.cloud import secretmanager  # import tardio
        client = secretmanager.SecretManagerServiceClient()
        path = f"projects/{project}/secrets/{secret_name}/versions/latest"
        resp = client.access_secret_version(name=path)
        return resp.payload.data.decode("utf-8").strip()
    return _provider
