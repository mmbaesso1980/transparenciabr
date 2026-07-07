# -*- coding: utf-8 -*-
"""
wolf_trader.ultra — modo ULTRA autonomo, integrado ao robo existente.

NAO cria bot Telegram proprio (evita conflito 409): e acionado pelos comandos
/startwolfultra e /stopwolfultra que chegam pelo ouvinte JA existente
(comando_telegram.py -> runner._tratar_comando).

Reusa o polymarket_client real:
  - cotacao(token_id) -> Cotacao(bid, ask, mid)
  - postar_ordem(OrdemRequest(token_id, lado, preco, size, tipo)) -> OrdemResultado(ok, order_id, detalhe)

Melhorias sobre Bra-Nor / Mex-Eng:
  1. Recolhimento LOCAL a partir do min 85 (independe de credito de agente).
  2. Teto dinamico = banca_liquida - fee_buffer(0.25), cap US$1000.
  3. Relogio do jogo (ESPN) na decisao.
  4. Prorrogacao -> migra p/ Team to Advance.
  5. Opera 3 mercados (vit A, vit B, empate).

Renan-YES NUNCA vendida. Telegram em 100% das transacoes.

Roda numa thread daemon dentro do processo do runner. Estado em /tmp/wolf_ctl/.
"""
from __future__ import annotations
import os, json, time, threading, logging, urllib.parse, urllib.request

log = logging.getLogger("wolf_trader.ultra")

RENAN_TOKEN = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
FUNDER      = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
FEE_BUFFER  = 0.25
MAX_ORDER   = 1000.0
UA          = "TransparenciaBR-engines/1.0"

# ---- MODO de operacao: 'seguro' (default) ou 'agressivo' ----
# Agressivo captura MAIS micro-movimentos (gatilho menor + cooldown menor),
# MAS mantem TODAS as travas de perda intactas (stop-loss/trailing/Renan sagrados).
MODO = os.environ.get("WOLF_MODO", "seguro").strip().lower()
_AGGR = (MODO == "agressivo")
_def_trigger  = "0.012" if _AGGR else "0.02"    # 1.2% vs 2%
_def_cooldown = "25"    if _AGGR else "45"      # 25s vs 45s por token
_def_poll     = "2.0"   if _AGGR else "3.0"

# ---- Blindagens aprendidas com 05/07 (Bra-Nor / Mex-Eng) ----
# 1) momentum: agressivo dispara mais cedo, mas ainda longe do churning de ontem (0.0008)
TRIGGER_PCT  = float(os.environ.get("WOLF_TRIGGER_PCT", _def_trigger))
# 2) recolhimento no min 80 (era 85) -> realiza antes do caos final
FLATTEN_MIN  = int(os.environ.get("WOLF_FLATTEN_MIN", "80"))
# 3) cadencia: 1 ordem a cada COOLDOWN_S por token -> mata o giro
COOLDOWN_S   = float(os.environ.get("WOLF_COOLDOWN_S", _def_cooldown))
# 4) STOP-LOSS de sessao: se P/L cair abaixo disto, recolhe e para o jogo
STOP_LOSS    = float(os.environ.get("WOLF_STOP_LOSS_USD", "-5.0"))
# 5) TAKE-PROFIT de pico: se lucro do jogo passar disto, trava e para
TAKE_PROFIT  = float(os.environ.get("WOLF_TAKE_PROFIT_USD", "6.0"))
# 6) trailing: se recuar TRAIL_GIVEBACK do pico de lucro, trava e para
TRAIL_GIVEBACK = float(os.environ.get("WOLF_TRAIL_GIVEBACK_USD", "2.5"))
# 7) so opera preco 'vivo' (evita empate morto a 0.06 tipo ontem)
MIN_PRICE    = float(os.environ.get("WOLF_MIN_PRICE", "0.12"))
MAX_PRICE    = float(os.environ.get("WOLF_MAX_PRICE", "0.90"))
# 8) teto de exposicao por jogo (alem do MAX_ORDER por ordem)
MAX_STAKE_GAME = float(os.environ.get("WOLF_MAX_STAKE_GAME_USD", "1000.0"))
POLL_S      = float(os.environ.get("WOLF_POLL_S", _def_poll))
# 8b) LOTE por clique (microtick): lances pequenos, respeitando o minimo US$1 da Polymarket.
#     ORDER_USD = valor-alvo por ordem; MIN_ORDER_USD = piso rigido do Polymarket.
MIN_ORDER_USD = float(os.environ.get("WOLF_MIN_ORDER_USD", "1.0"))
ORDER_USD     = float(os.environ.get("WOLF_ORDER_USD", "1.0"))
# 8d) PISO em QUOTAS (nao em dolar): Polymarket rejeita ordem com menos de 5 shares
#     ('Size (x) lower than the minimum: 5'). E o tick de PRECO dos mercados de
#     Copa (moneyline / to-advance / spreads / totals) e 0.0025 (0.25 centavos).
MIN_SHARES  = float(os.environ.get("WOLF_MIN_SHARES", "5"))
TICK_PRICE  = float(os.environ.get("WOLF_TICK_PRICE", "0.0025"))
# 8e) ECONOMIA DA MICROTROCA: a briga e por centavos RESPEITANDO a taxa.
#     FEE_PCT = taxa estimada por lado (~ taker). EDGE_MIN_PCT = borda extra
#     exigida alem de cobrir 2x a taxa (ida e volta). So gira se houver borda.
FEE_PCT      = float(os.environ.get("WOLF_FEE_PCT", "0.0"))
EDGE_MIN_PCT = float(os.environ.get("WOLF_EDGE_MIN_PCT", "0.0"))
# 8c) KICKSTART (microtick em mercado ESTATICO): quando o momentum nao dispara
#     porque o mid esta parado (mercado pre-jogo), forcamos lances alternados
#     BUY/SELL pequenos para GIRAR a posicao ativamente. Respeita TODAS as
#     travas (teto do jogo, stop-loss, faixa de preco, cooldown, Renan blindada).
#     KICKSTART=1 liga; KICKSTART_AFTER = ciclos sem sinal antes de forcar (0 = ja no 1o ciclo).
KICKSTART       = os.environ.get("WOLF_KICKSTART", "0").strip() in ("1", "true", "True", "sim", "SIM")
KICKSTART_AFTER = int(os.environ.get("WOLF_KICKSTART_AFTER", "0"))
# 8f) MODO MAKER: em vez de PAGAR o spread (taker: vende no bid / compra no ask),
#     POSTAMOS ordens PASSIVAS que CAPTURAM o spread. Como maker a taxa Polymarket
#     e ~0 (o taker que cruza paga), entao a briga por centavos vira POSITIVA:
#       - BUY passiva no melhor BID (ou +1 tick p/ prioridade de fila) -> compra barato
#       - SELL passiva no melhor ASK (ou -1 tick p/ prioridade) -> vende caro
#     Captura por giro fechado ~= (ask - bid) - taxa_maker(~0). GTC = ordem que
#     DESCANSA no book ate ser cruzada. WOLF_MAKER_JOIN=1 posta EXATO no topo do
#     book (join); =0 posta 1 tick DENTRO (melhora a fila, reduz a captura em 1 tick).
MAKER        = os.environ.get("WOLF_MAKER", "0").strip() in ("1", "true", "True", "sim", "SIM")
MAKER_JOIN   = os.environ.get("WOLF_MAKER_JOIN", "1").strip() in ("1", "true", "True", "sim", "SIM")
# 8g) MODO FRENETICO (WOLF_FRENETIC=1): market-making BILATERAL de alta frequencia.
#     A CADA ciclo, para CADA token, posta SIMULTANEAMENTE:
#       - BUY passiva no BID (compra barato) — limitada por caixa/teto
#       - SELL passiva no ASK (vende caro)   — limitada por quotas em carteira
#     Captura o spread dos DOIS lados (tecnica classica de formador de mercado)
#     e sobrepoe SINAL TECNICO (momentum + reversao a media via EWMA) p/ inclinar
#     o inventario a favor da tendencia intraciclo. Giro maximo que o book permitir.
#     TODAS as travas continuam: teto US$/jogo, stop-loss, faixa de preco, Renan.
#     O Comandante ASSUME O RISCO (diretiva explicita) — cooldown ~0, poll rapido.
FRENETIC     = os.environ.get("WOLF_FRENETIC", "0").strip() in ("1", "true", "True", "sim", "SIM")
# EWMA p/ reversao a media: alfa do filtro e desvio (em %) que dispara skew de inventario
EWMA_ALPHA   = float(os.environ.get("WOLF_EWMA_ALPHA", "0.25"))
REVERT_PCT   = float(os.environ.get("WOLF_REVERT_PCT", "0.015"))

STATE_DIR = "/tmp/wolf_ctl"
os.makedirs(STATE_DIR, exist_ok=True)
GAME_CFG  = os.path.join(STATE_DIR, "ultra_game.json")

TG_TOKEN = os.environ.get("WOLF_TG_TOKEN", "").strip()
CHAT_ID  = os.environ.get("WOLF_TG_CHAT", "6483072695").strip()


def _tg(text: str):
    if not TG_TOKEN:
        log.info("[ultra->tg desativado] %s", text); return
    try:
        data = urllib.parse.urlencode({
            "chat_id": CHAT_ID, "text": text, "parse_mode": "HTML",
            "disable_web_page_preview": "true"}).encode()
        urllib.request.urlopen(
            urllib.request.Request(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data),
            timeout=15).read()
    except Exception as e:
        log.warning("falha telegram ultra: %s", e)


def _http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())


def _positions():
    try:
        return _http_json(f"https://data-api.polymarket.com/positions?user={FUNDER}&sizeThreshold=0")
    except Exception as e:
        log.warning("positions: %s", e); return []


def _slug_from_link(link: str):
    import re
    link = (link or "").strip()
    # 1) formatos classicos /event/<slug> e /market/<slug>
    m = re.search(r"/(?:event|market)/([a-z0-9\-]+)", link)
    if m:
        return m.group(1).split("?")[0]
    # 2) formato de esportes: .../sports/<liga>/<slug> — o slug e o ULTIMO segmento
    #    ex.: https://polymarket.com/pt/sports/world-cup/fifwc-che-col-2026-07-07
    if "polymarket.com" in link and "/sports/" in link:
        tail = link.split("/sports/", 1)[1].split("?")[0].split("#")[0]
        segs = [s for s in tail.split("/") if s]
        if segs:
            cand = segs[-1]
            if re.fullmatch(r"[a-z0-9\-]+", cand):
                return cand
    # 3) o proprio slug puro
    if re.fullmatch(r"[a-z0-9\-]+", link):
        return link
    return None


def assimilar_jogo(link: str, espn_event_id=None):
    """Consulta a Gamma API e monta a config do jogo. Retorna (cfg, erro).
    espn_event_id: opcional, ativa o relogio ESPN p/ recolhimento no min 85."""
    slug = _slug_from_link(link)
    if not slug:
        return None, "Link não reconhecido. Envie a URL do evento (…/event/&lt;slug&gt;)."
    try:
        ev = _http_json(f"https://gamma-api.polymarket.com/events?slug={urllib.parse.quote(slug)}")
    except Exception as e:
        return None, f"Falha ao consultar Polymarket: {e}"
    if not ev:
        return None, f"Evento não encontrado (slug '{slug}')."
    event = ev[0] if isinstance(ev, list) else ev
    cfg = {"slug": slug, "title": event.get("title", slug), "funder": FUNDER,
           "moneyline": [], "team_to_advance": [], "espn_event_id": espn_event_id,
           "assimilated_at": int(time.time())}
    for m in event.get("markets", []):
        q = (m.get("question") or "").lower()
        outs = m.get("outcomes"); toks = m.get("clobTokenIds")
        if isinstance(outs, str): outs = json.loads(outs or "[]")
        if isinstance(toks, str): toks = json.loads(toks or "[]")
        pairs = list(zip(outs or [], toks or []))
        target = "team_to_advance" if ("advance" in q) else "moneyline"
        # opera SO o lado afirmativo (Yes) de cada mercado; comprar Yes e No
        # do mesmo desfecho se anula e desperdica caixa. Rotula pela pergunta.
        label = m.get("groupItemTitle") or m.get("question") or (outs[0] if outs else "?")
        for o, t in pairs:
            if str(o).strip().lower() != "yes":
                continue
            cfg[target].append({"outcome": label, "token_id": t})
    if not cfg["moneyline"]:
        return None, "Não encontrei o mercado de resultado (moneyline) deste evento."
    return cfg, None


# ---------------- Motor (usa client real do robo) ----------------
class UltraEngine:
    def __init__(self, client, gate_fn=None):
        """
        client: instancia de PolymarketClient (tem .cotacao() e .postar_ordem()).
        gate_fn: callable opcional (usd) -> bool  (reusa aprovar_gate US$1000 do engine).
        """
        self.client = client
        self.gate_fn = gate_fn
        # multi-jogo: um worker por slug (rodam SIMULTANEOS)
        self._threads = {}     # slug -> Thread
        self._stops = {}       # slug -> Event
        self._cfgs = {}        # slug -> cfg
        self._lock = threading.Lock()
        self._last_mid = {}
        # blindagens: estado por jogo/token
        self._pnl = {}         # slug -> fluxo caixa realizado (SELL+ / BUY-)
        self._peak = {}        # slug -> maior lucro visto no jogo
        self._stake = {}       # slug -> exposicao BUY acumulada
        self._last_order = {}  # token_id -> ts ultima ordem (cooldown)
        self._cash = {}        # slug -> caixa REALIZADO disponivel p/ recomprar (rotacao)
        self._realized = {}    # slug -> lucro/prejuizo REALIZADO (SELL - custo medio)
        self._avgcost = {}     # token_id -> preco medio de compra (p/ P/L realizado)
        self._pos_cache = (0.0, {})  # (ts, {token_id: shares}) cache curto de posicoes
        self._risk_stopped = set()   # slugs que pararam por TRAVA (nao religar)
        self._ewma = {}              # token_id -> media exponencial do mid (reversao)

    # --- infra de ordem via client real ---
    def _cotacao(self, token_id):
        try:
            return self.client.cotacao(token_id)
        except Exception as e:
            log.warning("cotacao %s: %s", token_id[-6:], e); return None

    def _postar(self, token_id, lado, size_shares, preco, slug=None):
        # importa OrdemRequest do modulo real
        from wolf_trader.polymarket_client import OrdemRequest
        usd = size_shares * preco
        if self.gate_fn and not self.gate_fn(usd):
            _tg(f"⛔ Ordem {lado} US${usd:.2f} barrada pelo gate de risco.")
            return False
        try:
            # PRECISAO Polymarket (World Cup moneyline/advance): tick de PRECO = 0.0025
            # (0.25 centavos). O minimo NAO e em dolar — e em QUOTAS: size >= MIN_SHARES
            # (a API rejeita com 'Size (x) lower than the minimum: 5'). BUY informa dolar,
            # SELL informa quotas; em ambos o size final tem de respeitar o piso de quotas.
            preco_q = round(round(preco / TICK_PRICE) * TICK_PRICE, 4)
            if preco_q <= 0:
                preco_q = TICK_PRICE
            if preco_q >= 1:
                preco_q = 1 - TICK_PRICE
            # size em quotas, arredondado a 2 casas e NUNCA abaixo do piso de quotas
            size_q = round(size_shares, 2)
            if size_q < MIN_SHARES:
                size_q = float(MIN_SHARES)
            if size_q <= 0:
                return False
            usd = round(size_q * preco_q, 4)  # usd real da ordem quantizada
            if self.gate_fn and not self.gate_fn(usd):
                return False
            req = OrdemRequest(token_id=token_id, lado=lado, preco=preco_q,
                               size=size_q, tipo="GTC")
            res = self.client.postar_ordem(req)
            ok = getattr(res, "ok", False)
            if ok:
                # contabiliza caixa/exposicao e P/L REALIZADO (nao fluxo bruto)
                self._last_order[token_id] = time.time()
                if slug is not None:
                    if lado == "BUY":
                        # atualiza preco medio ponderado do token e consome caixa
                        prev_sh = self._shares_de(token_id)
                        prev_avg = self._avgcost.get(token_id, preco_q)
                        new_sh = max(1e-9, prev_sh + size_q)
                        self._avgcost[token_id] = (prev_avg * prev_sh + preco_q * size_q) / new_sh
                        self._stake[slug] = self._stake.get(slug, 0.0) + usd
                        self._cash[slug] = self._cash.get(slug, 0.0) - usd   # gasta caixa realizado
                    else:  # SELL: gera caixa realizado e P/L realizado (venda - custo medio)
                        avg = self._avgcost.get(token_id, preco_q)
                        self._realized[slug] = self._realized.get(slug, 0.0) + (preco_q - avg) * size_q
                        self._cash[slug] = self._cash.get(slug, 0.0) + usd   # credita caixa realizado
                    # invalida cache de posicoes p/ o proximo tick ler o size real
                    self._pos_cache = (0.0, {})
                    # P/L do jogo p/ blindagens = REALIZADO (giro fechado), nao marcacao
                    self._pnl[slug] = self._realized.get(slug, 0.0)
            _tg(f"{'💠' if ok else '⚠️'} <b>{lado}</b> {size_shares:.1f}sh @ {preco:.3f} "
                f"tok …{token_id[-6:]} → {getattr(res,'detalhe', res)}")
            return ok
        except Exception as e:
            _tg(f"⚠️ Falha {lado} tok …{token_id[-6:]}: {e}"); return False

    def _cooldown_ok(self, token_id):
        last = self._last_order.get(token_id, 0)
        return (time.time() - last) >= COOLDOWN_S

    def _teto_usd(self):
        # banca operavel = valor das posicoes NAO-Renan (currentValue).
        # A carteira do funder nao mantem USDC livre parado (verificado on-chain:
        # USDC/USDC.e = 0); todo o caixa esta investido nas posicoes. Portanto o
        # giro (churn) se faz VENDENDO parte da posicao e RECOMPRANDO — nao ha
        # cash ocioso para alavancar alem do que ja esta em posicao.
        tot = 0.0
        for p in _positions():
            if str(p.get("asset")) == RENAN_TOKEN:
                continue
            tot += float(p.get("currentValue", 0) or 0)
        # divide o caixa entre os jogos ativos p/ evitar dupla-alavancagem
        n = max(1, len(self._threads))
        return max(0.0, min(MAX_ORDER, (tot - FEE_BUFFER) / n))

    def _shares_de(self, token_id):
        """Quotas ATUALMENTE em carteira para um token (cache curto de 5s p/
        nao martelar a data-api a cada tick). Base para NUNCA vender mais do
        que se tem (evita 'not enough balance')."""
        ts, cache = self._pos_cache
        if time.time() - ts > 5.0:
            cache = {}
            for p in _positions():
                try:
                    cache[str(p.get("asset"))] = float(p.get("size", 0) or 0)
                except Exception:
                    pass
            self._pos_cache = (time.time(), cache)
        return cache.get(str(token_id), 0.0)

    def flatten_except_renan(self, motivo="", slug=None):
        _tg(f"🧹 <b>Recolhimento</b> ({motivo}) — vendendo tudo exceto Renan-YES.")
        n = 0
        for p in _positions():
            tok = str(p.get("asset"))
            if tok == RENAN_TOKEN:
                continue
            size = float(p.get("size", 0) or 0)
            cv   = float(p.get("currentValue", 0) or 0)
            if size <= 0 or cv <= 0:
                continue
            cot = self._cotacao(tok)
            preco = getattr(cot, "bid", None) or getattr(cot, "mid", None) or 0.01
            if self._postar(tok, "SELL", size, float(preco), slug=slug):
                n += 1
            time.sleep(0.5)
        _tg(f"✅ Recolhimento concluído: {n} posição(ões) liquidada(s). Renan-YES intacta.")
        return n

    # --- relogio ESPN ---
    def _game_state(self, espn_id):
        if not espn_id:
            return None
        try:
            d = _http_json(f"https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={espn_id}")
            st = d.get("header", {}).get("competitions", [{}])[0].get("status", {})
            clock = st.get("displayClock", "")
            minute = None
            if clock and ":" in clock:
                try: minute = int(clock.split(":")[0])
                except Exception: minute = None
            return {"minute": minute, "period": st.get("period", 0),
                    "state": st.get("type", {}).get("state", ""),
                    "detail": st.get("type", {}).get("detail", "")}
        except Exception as e:
            log.warning("espn: %s", e); return None

    def _momentum(self, token_id):
        """Retorna (sinal, mid, bid, ask). O sinal vem da variacao do mid; os
        precos bid/ask servem p/ precificar SELL no bid e BUY no ask (brigar
        por centavos no spread real, nunca no mid falso)."""
        cot = self._cotacao(token_id)
        mid = getattr(cot, "mid", None) if cot else None
        bid = getattr(cot, "bid", None) if cot else None
        ask = getattr(cot, "ask", None) if cot else None
        if mid is None:
            return 0, None, None, None
        prev = self._last_mid.get(token_id)
        self._last_mid[token_id] = mid
        if not prev:
            return 0, mid, bid, ask
        d = (mid - prev) / prev
        if d >= TRIGGER_PCT:  return +1, mid, bid, ask
        if d <= -TRIGGER_PCT: return -1, mid, bid, ask
        return 0, mid, bid, ask

    def _tecnico(self, token_id, mid):
        """SINAL TECNICO composto p/ o modo frenetico (tecnicas de bolsa):
          - MOMENTUM: variacao do mid vs tick anterior (segue a tendencia).
          - REVERSAO A MEDIA (EWMA): se o mid desviou > REVERT_PCT da media
            exponencial, aposta no retorno (compra abaixo da media, vende acima).
        Retorna 'skew' em [-1..+1]: +1 vies COMPRADOR (inclina a BUY), -1 vies
        VENDEDOR (inclina a SELL), 0 neutro (market-making simetrico).
        NAO decide sozinho o valor: apenas inclina o inventario. As travas mandam."""
        if mid is None:
            return 0.0
        ew = self._ewma.get(token_id)
        ew = mid if ew is None else (EWMA_ALPHA * mid + (1 - EWMA_ALPHA) * ew)
        self._ewma[token_id] = ew
        prev = self._last_mid.get(token_id)
        mom = 0.0
        if prev:
            mom = (mid - prev) / prev
        # desvio da media (reversao): mid ACIMA da media -> vies VENDEDOR (-)
        dev = (mid - ew) / ew if ew else 0.0
        skew = 0.0
        # momentum forte domina (segue tendencia)
        if mom >= TRIGGER_PCT:   skew += 0.6
        elif mom <= -TRIGGER_PCT: skew -= 0.6
        # reversao a media (contrarian) quando desvio grande
        if dev >= REVERT_PCT:    skew -= 0.4
        elif dev <= -REVERT_PCT: skew += 0.4
        return max(-1.0, min(1.0, skew))

    # --- loop principal ---
    def _run(self, cfg, stop):
        title = cfg.get("title"); espn = cfg.get("espn_event_id")
        ml = cfg.get("moneyline", []); tta = cfg.get("team_to_advance", [])
        slug_id = cfg.get("slug")
        self._pnl[slug_id] = 0.0; self._peak[slug_id] = 0.0; self._stake[slug_id] = 0.0
        self._cash[slug_id] = 0.0; self._realized[slug_id] = 0.0
        _tg(f"🐺 <b>ULTRA em operação</b> — {title}\n"
            f"Resultado: {', '.join(m['outcome'] for m in ml)}\n"
            f"Team to Advance: {', '.join(m['outcome'] for m in tta) or '(n/d)'}\n"
            f"🛡️ Blindagens: stop-loss US${STOP_LOSS:.0f} | take-profit US${TAKE_PROFIT:.0f} | "
            f"trailing US${TRAIL_GIVEBACK:.1f} | cooldown {COOLDOWN_S:.0f}s | recolhe min {FLATTEN_MIN}.\n"
            f"⚙️ Modo de execução: <b>{'⚡ FRENÉTICO — market-making BILATERAL (BUY+SELL a cada tick, captura spread nas 2 pontas)' if FRENETIC else ('MAKER (captura o spread — taxa ~0)' if MAKER else 'TAKER (cruza o book)')}</b>"
            f"{(' — sinal técnico: momentum + reversão à média (EWMA) inclina o inventário' if FRENETIC else (' — post no topo (join)' if (MAKER and MAKER_JOIN) else (' — 1 tick dentro' if MAKER else '')))}.\n"
            f"{('🔁 poll ' + format(POLL_S, '.1f') + 's | cooldown ' + format(COOLDOWN_S, '.0f') + 's — giro máximo.' + chr(10)) if FRENETIC else ''}"
            f"Máx US$1000/ordem, faixa preço {MIN_PRICE}-{MAX_PRICE}. Renan-YES blindada.")
        flattened = False; migrated = False; parou_por_risco = False
        # KICKSTART: contador de ciclos sem sinal e lado alternante por token
        _ks_idle = {}   # token -> ciclos consecutivos com sig==0
        _ks_side = {}   # token -> proximo lado a forcar (+1 BUY / -1 SELL)
        while not stop.is_set():
            gs = self._game_state(espn)
            if gs:
                in_extra = gs["period"] >= 5 or "extra" in gs["detail"].lower()
                if in_extra and tta and not migrated:
                    _tg("⏱️ Prorrogação — migrando para <b>Team to Advance</b>.")
                    self.flatten_except_renan("prorrogação: migrar p/ TTA", slug=slug_id); migrated = True
                if gs["minute"] is not None and gs["minute"] >= FLATTEN_MIN and not in_extra and not flattened:
                    self.flatten_except_renan(f"min {gs['minute']} (fim de jogo)", slug=slug_id); flattened = True
                if gs["state"] == "post":
                    if not flattened and not migrated:
                        self.flatten_except_renan("apito final", slug=slug_id)
                    _tg(f"🏁 Jogo encerrado — {title}. Ultra finalizando."); break

            # ---- BLINDAGENS DE RISCO (P/L do jogo) ----
            pnl = self._pnl.get(slug_id, 0.0)
            self._peak[slug_id] = max(self._peak.get(slug_id, 0.0), pnl)
            peak = self._peak[slug_id]
            if not flattened and not migrated:
                if pnl <= STOP_LOSS:
                    _tg(f"🛑 <b>STOP-LOSS</b> {title}: P/L US${pnl:.2f} ≤ US${STOP_LOSS:.2f}. Recolhendo e parando.")
                    self.flatten_except_renan("stop-loss", slug=slug_id); parou_por_risco = True; self._risk_stopped.add(slug_id); break
                if pnl >= TAKE_PROFIT:
                    _tg(f"🎯 <b>TAKE-PROFIT</b> {title}: P/L US${pnl:.2f} ≥ US${TAKE_PROFIT:.2f}. Travando lucro e parando.")
                    self.flatten_except_renan("take-profit", slug=slug_id); parou_por_risco = True; self._risk_stopped.add(slug_id); break
                if peak >= 1.5 and (peak - pnl) >= TRAIL_GIVEBACK:
                    _tg(f"📉 <b>TRAILING</b> {title}: recuou US${peak-pnl:.2f} do pico (US${peak:.2f}→US${pnl:.2f}). Travando e parando.")
                    self.flatten_except_renan("trailing-stop", slug=slug_id); parou_por_risco = True; self._risk_stopped.add(slug_id); break

            try:
                active = tta if migrated else ml
                if not flattened or migrated:
                    teto = self._teto_usd()
                    stake_jogo = self._stake.get(slug_id, 0.0)
                    if teto > 1.0 and stake_jogo < MAX_STAKE_GAME:
                        for mk in active:
                            if stop.is_set(): break
                            tok = mk["token_id"]
                            if not self._cooldown_ok(tok):        # trava anti-churning
                                continue
                            sig, mid, bid, ask = self._momentum(tok)
                            if not (mid and MIN_PRICE < mid < MAX_PRICE):
                                continue  # so preco vivo (evita po e mercado resolvido)
                            if not (bid and ask):
                                continue  # sem book confiavel dos dois lados

                            # KICKSTART: em mercado estatico o momentum fica em 0.
                            # Apos KICKSTART_AFTER ciclos parados, GIRAMOS a posicao:
                            # SELL-first (posicao -> caixa), depois RECOMPRA com o caixa
                            # realizado. Quando o mercado volta a andar, o momentum manda.
                            if sig == 0 and KICKSTART:
                                _ks_idle[tok] = _ks_idle.get(tok, 0) + 1
                                if _ks_idle[tok] > KICKSTART_AFTER:
                                    sig = _ks_side.get(tok, -1)   # comeca vendendo
                                    _ks_side[tok] = -sig          # alterna p/ o proximo
                                    _ks_idle[tok] = 0
                            elif sig != 0:
                                _ks_idle[tok] = 0

                            # PRECO da microtroca: VENDE no BID, COMPRA no ASK (nunca no
                            # mid). A briga e por centavos no spread REAL. Alem disso, a
                            # ida-e-volta so vale se o spread capturado superar a taxa:
                            #   ganho_%_round_trip = (ask-bid)/mid ; custo ~= 2*FEE_PCT
                            # Se nao houver borda, NAO opera (evita sangria por taxa).
                            spread_pct = (ask - bid) / mid if mid else 0.0
                            borda_ok = spread_pct >= (2.0 * FEE_PCT + EDGE_MIN_PCT)
                            if not borda_ok:
                                # sem borda p/ cobrir a taxa: so segue em KICKSTART
                                # (giro forcado) ou no FRENETICO (giro maximo pedido
                                # pelo Comandante, que ASSUMIU O RISCO), senao pula.
                                if not (FRENETIC or (KICKSTART and _ks_idle.get(tok, 1) == 0)):
                                    continue

                            # LOTE microtick alvo em QUOTAS: piso de 5 shares (regra dura).
                            lote_sh = max(MIN_SHARES, ORDER_USD / mid)
                            lote_usd = lote_sh * mid
                            if lote_usd > MAX_ORDER:
                                continue  # lance minimo ja excede o teto por ordem

                            # PRECIFICACAO por MODO:
                            #  - TAKER (default): SELL cruza no BID, BUY cruza no ASK
                            #    (execucao imediata, mas PAGA spread+taxa).
                            #  - MAKER (WOLF_MAKER=1): ordens PASSIVAS que CAPTURAM o
                            #    spread. SELL descansa no ASK, BUY descansa no BID.
                            #    Com JOIN=0, entra 1 tick DENTRO do topo (melhor fila).
                            #    O tick real do mercado e resolvido pelo trader (v2);
                            #    aqui usamos TICK_PRICE so p/ deslocar o preco de post.
                            if MAKER:
                                if MAKER_JOIN:
                                    preco_sell, preco_buy = ask, bid
                                else:
                                    # 1 tick p/ dentro do book (agressivo na fila,
                                    # sem cruzar): SELL um tick abaixo do ask, BUY um
                                    # tick acima do bid. Clampa p/ nao inverter o spread.
                                    preco_sell = max(bid + TICK_PRICE, ask - TICK_PRICE)
                                    preco_buy  = min(ask - TICK_PRICE, bid + TICK_PRICE)
                            else:
                                preco_sell, preco_buy = bid, ask

                            # =========== MODO FRENETICO (WOLF_FRENETIC=1) ===========
                            # Market-making BILATERAL de alta frequencia: a CADA ciclo
                            # posta OS DOIS lados AO MESMO TEMPO por token — BUY no bid
                            # (ou 1 tick dentro) E SELL no ask — capturando o spread nas
                            # DUAS pontas (tecnica classica de formador de mercado). O
                            # sinal tecnico (_tecnico: momentum + reversao a media via
                            # EWMA) NAO decide compra/venda sozinho: apenas INCLINA o
                            # tamanho de cada lado (skew), deixando as TRAVAS mandarem.
                            # Todas as blindagens continuam: piso 5 shares, teto por
                            # jogo/ordem, _shares_de (nunca vende mais do que tem em
                            # carteira), faixa de preco viva, US$1000/ordem, Renan
                            # blindada (nunca entra na allowlist do jogo).
                            if FRENETIC:
                                # PRECIFICACAO PASSIVA OBRIGATORIA no frenetico:
                                # SELL descansa no ASK, BUY descansa no BID. Assim
                                # o robo CAPTURA o spread nas duas pontas (taxa maker
                                # ~0) em vez de CRUZAR o book e pagar spread+taxa
                                # (taker). Independe da flag MAKER — frenetico e
                                # sempre formador de mercado.
                                preco_sell, preco_buy = ask, bid
                                skew = self._tecnico(tok, mid)          # -1..+1
                                # ---- lado SELL (limitado pelas quotas em carteira) ----
                                held = self._shares_de(tok)
                                if held >= MIN_SHARES:
                                    # vies vendedor (skew<0) aumenta o lote de venda
                                    fator_s = 1.0 + max(0.0, -skew)     # 1.0 .. 2.0
                                    sh_s = min(lote_sh * fator_s, held)
                                    if sh_s >= MIN_SHARES:
                                        self._postar(tok, "SELL", sh_s, preco_sell, slug=slug_id)
                                # ---- lado BUY (arranca do TETO; caixa e' bonus) ----
                                # DIFERENCA p/ o modo unilateral: aqui o BUY NAO exige
                                # caixa REALIZADO previo (senao no 1o ciclo, sem caixa,
                                # so venderia). O Comandante ASSUMIU O RISCO e quer as
                                # DUAS pontas vivas desde o 1o tick. Limite duro continua
                                # sendo o TETO por jogo + teto por ordem (US$1000).
                                restante_jogo = max(0.0, MAX_STAKE_GAME - stake_jogo)
                                # vies comprador (skew>0) aumenta o lote de compra
                                fator_b = 1.0 + max(0.0, skew)          # 1.0 .. 2.0
                                alvo_usd = min(lote_usd * fator_b, MAX_ORDER)
                                budget = min(alvo_usd, restante_jogo, teto)
                                if budget >= (MIN_SHARES * preco_buy) - 1e-9 and preco_buy > 0:
                                    sh_b = max(MIN_SHARES, budget / preco_buy)
                                    self._postar(tok, "BUY", sh_b, preco_buy, slug=slug_id)
                                continue   # frenetico ja postou os dois lados; proximo token
                            # ========================================================

                            if sig == -1:
                                # VENDER: nunca mais que as quotas EM CARTEIRA
                                # (evita 'not enough balance'), nunca menos que o piso.
                                held = self._shares_de(tok)
                                if held < MIN_SHARES:
                                    continue
                                shares = min(lote_sh, held)
                                if shares < MIN_SHARES:
                                    continue
                                self._postar(tok, "SELL", shares, preco_sell, slug=slug_id)
                            elif sig == +1:
                                # COMPRAR: SO com caixa REALIZADO das vendas
                                # (rotacao) e respeitando o teto. Nunca compra do 'nada'.
                                caixa = self._cash.get(slug_id, 0.0)
                                restante_jogo = max(0.0, MAX_STAKE_GAME - stake_jogo)
                                budget = min(lote_usd, caixa, restante_jogo, teto)
                                if budget < lote_usd - 1e-9:
                                    continue  # sem caixa/teto p/ um lote de 5 quotas
                                shares = max(MIN_SHARES, budget / preco_buy)
                                self._postar(tok, "BUY", shares, preco_buy, slug=slug_id)
            except Exception as _e_ciclo:
                # Exceção transitória (timeout de API, book vazio, etc.) NÃO
                # pode matar o worker: registra e segue no próximo ciclo. É o
                # que torna o robô resiliente e autônomo (antes uma exceção
                # derrubava a thread silenciosamente e o jogo parava).
                try: print(f'[ultra] ciclo ignorou erro transitório: {_e_ciclo}', flush=True)
                except Exception: pass
            stop.wait(POLL_S)
        if not flattened and not migrated and not parou_por_risco:
            self.flatten_except_renan("parada manual", slug=slug_id)
        _tg(f"🔻 Ultra encerrado — {title}. Renan-YES blindada.")
        with self._lock:
            self._threads.pop(cfg.get("slug"), None)
            self._stops.pop(cfg.get("slug"), None)
            self._cfgs.pop(cfg.get("slug"), None)

    def start(self, cfg):
        """Inicia um worker por jogo. Multiplos jogos rodam SIMULTANEAMENTE."""
        slug = cfg.get("slug")
        with self._lock:
            t = self._threads.get(slug)
            if t and t.is_alive():
                _tg(f"⚠️ Ultra já opera este jogo ({cfg.get('title', slug)}).")
                return False
            stop = threading.Event()
            self._stops[slug] = stop
            self._cfgs[slug] = cfg
            th = threading.Thread(target=self._run, args=(cfg, stop), daemon=True)
            self._threads[slug] = th
            th.start()
        # persiste catalogo de jogos ativos
        try: json.dump(list(self._cfgs.values()), open(GAME_CFG, "w"))
        except Exception: pass
        return True

    def stop(self, slug=None):
        """Para um jogo (slug) ou TODOS se slug=None."""
        with self._lock:
            slugs = [slug] if slug else list(self._threads.keys())
            for s in slugs:
                ev = self._stops.get(s)
                if ev: ev.set()
            threads = [(s, self._threads.get(s)) for s in slugs]
        for s, t in threads:
            if t and t.is_alive():
                t.join(timeout=30)
        return True

    def is_running(self):
        return any(t.is_alive() for t in self._threads.values())

    def ativos(self):
        return [c.get("title", s) for s, c in self._cfgs.items()
                if self._threads.get(s) and self._threads[s].is_alive()]


# ---------------- Scheduler AUTONOMO (start/stop sem intervencao) ----------------
AUTO_GAMES = os.environ.get("WOLF_AUTO_GAMES", "/opt/wolf/repo/wolf_ultra_deploy/auto_games.json")
PRE_KICKOFF_MIN = float(os.environ.get("WOLF_PRE_KICKOFF_MIN", "3"))   # inicia N min antes do apito
WATCH_S         = float(os.environ.get("WOLF_WATCH_S", "60"))          # varredura do scheduler


def _espn_kickoff(espn_id):
    """Retorna (epoch_apito, state) do jogo via ESPN. state in pre/in/post."""
    if not espn_id:
        return None, None
    try:
        d = _http_json(f"https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/summary?event={espn_id}")
        comp = d.get("header", {}).get("competitions", [{}])[0]
        st = comp.get("status", {}).get("type", {}).get("state", "")
        import datetime
        dt = comp.get("date") or d.get("header", {}).get("competitions", [{}])[0].get("date")
        ts = None
        if dt:
            dt = dt.replace("Z", "+00:00")
            ts = datetime.datetime.fromisoformat(dt).timestamp()
        return ts, st
    except Exception as e:
        log.warning("espn kickoff %s: %s", espn_id, e); return None, None


class AutoScheduler(threading.Thread):
    """Le auto_games.json e AUTO-INICIA cada jogo no apito. Encerramento e autonomo
    (relogio ESPN: recolhe no min FLATTEN_MIN, migra p/ TTA na prorrogacao, para no apito final).
    So dispara jogos que ainda nao terminaram. Idempotente por slug."""
    def __init__(self, engine):
        super().__init__(daemon=True)
        self.engine = engine
        self._started = set()   # slugs ja iniciados
        self._stop = threading.Event()
        self._announced = False

    def stop(self):
        self._stop.set()

    def _load(self):
        try:
            items = json.load(open(AUTO_GAMES))
            return items if isinstance(items, list) else []
        except Exception as e:
            log.warning("auto_games: %s", e); return []

    def run(self):
        _tg("🛰️ <b>Scheduler AUTÔNOMO ativo</b> — inicio e fim sem intervenção. "
            f"Cada jogo liga sozinho ~{PRE_KICKOFF_MIN:.0f} min antes do apito e encerra pelo relógio.")
        while not self._stop.is_set():
            for it in self._load():
                if not isinstance(it, dict):
                    continue
                link = it.get("link"); eid = it.get("espn_event_id")
                slug = _slug_from_link(link)
                if not slug or slug in self._started:
                    continue
                ko, state = _espn_kickoff(eid)
                now = time.time()
                # ja terminou -> nunca dispara
                if state == "post":
                    self._started.add(slug); continue
                # em andamento OU faltam <= PRE_KICKOFF_MIN p/ o apito -> inicia agora
                due = (state == "in") or (ko is not None and now >= ko - PRE_KICKOFF_MIN * 60)
                if not due:
                    continue
                cfg, err = assimilar_jogo(link, eid)
                if err or not cfg:
                    _tg(f"⚠️ Auto-start falhou p/ {slug}: {err}"); self._started.add(slug); continue
                if self.engine.start(cfg):
                    self._started.add(slug)
                    _tg(f"🐺 <b>AUTO-START</b> — {cfg.get('title', slug)} entrou em operação sozinho. "
                        "Encerramento automático pelo relógio.")
            self._stop.wait(WATCH_S)


_AUTO = {"engine": None, "sched": None}


def arm_autostart(client, gate_fn=None):
    """Liga o modo TOTALMENTE AUTONOMO: cria o engine e o scheduler. Idempotente.
    Chamado uma vez no boot do runner. Retorna o engine."""
    if _AUTO["engine"] is None:
        _AUTO["engine"] = UltraEngine(client, gate_fn=gate_fn)
    if _AUTO["sched"] is None or not _AUTO["sched"].is_alive():
        sch = AutoScheduler(_AUTO["engine"])
        _AUTO["sched"] = sch
        sch.start()
        log.info("AutoScheduler armado (auto_games=%s)", AUTO_GAMES)
    return _AUTO["engine"]


def disarm_autostart():
    """Para o scheduler autonomo (usado no /stopwolfultra): impede que ele
    reinicie jogos apos uma parada manual. NAO destroi o engine."""
    sch = _AUTO.get("sched")
    if sch is not None:
        try: sch.stop()
        except Exception: pass
        _AUTO["sched"] = None
        log.info("AutoScheduler desarmado (parada manual).")
