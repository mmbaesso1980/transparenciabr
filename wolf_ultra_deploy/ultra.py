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
# 8c) KICKSTART (microtick em mercado ESTATICO): quando o momentum nao dispara
#     porque o mid esta parado (mercado pre-jogo), forcamos lances alternados
#     BUY/SELL pequenos para GIRAR a posicao ativamente. Respeita TODAS as
#     travas (teto do jogo, stop-loss, faixa de preco, cooldown, Renan blindada).
#     KICKSTART=1 liga; KICKSTART_AFTER = ciclos sem sinal antes de forcar (0 = ja no 1o ciclo).
KICKSTART       = os.environ.get("WOLF_KICKSTART", "0").strip() in ("1", "true", "True", "sim", "SIM")
KICKSTART_AFTER = int(os.environ.get("WOLF_KICKSTART_AFTER", "0"))

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
        cot = self._cotacao(token_id)
        mid = getattr(cot, "mid", None) if cot else None
        if mid is None:
            return 0, None
        prev = self._last_mid.get(token_id)
        self._last_mid[token_id] = mid
        if not prev:
            return 0, mid
        d = (mid - prev) / prev
        if d >= TRIGGER_PCT:  return +1, mid
        if d <= -TRIGGER_PCT: return -1, mid
        return 0, mid

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
                    self.flatten_except_renan("stop-loss", slug=slug_id); parou_por_risco = True; break
                if pnl >= TAKE_PROFIT:
                    _tg(f"🎯 <b>TAKE-PROFIT</b> {title}: P/L US${pnl:.2f} ≥ US${TAKE_PROFIT:.2f}. Travando lucro e parando.")
                    self.flatten_except_renan("take-profit", slug=slug_id); parou_por_risco = True; break
                if peak >= 1.5 and (peak - pnl) >= TRAIL_GIVEBACK:
                    _tg(f"📉 <b>TRAILING</b> {title}: recuou US${peak-pnl:.2f} do pico (US${peak:.2f}→US${pnl:.2f}). Travando e parando.")
                    self.flatten_except_renan("trailing-stop", slug=slug_id); parou_por_risco = True; break

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
                        sig, mid = self._momentum(tok)
                        if not (mid and MIN_PRICE < mid < MAX_PRICE):
                            continue  # so preco vivo (evita po e mercado resolvido)

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

                        # LOTE microtick alvo em QUOTAS: nunca abaixo do piso de
                        # 5 shares (regra dura da Polymarket). Se ORDER_USD/mid der
                        # menos que 5 quotas, o piso vale (custa um pouco mais que
                        # ORDER_USD, mas e o minimo aceito pela API).
                        lote_sh = max(MIN_SHARES, ORDER_USD / mid)
                        lote_usd = lote_sh * mid
                        if lote_usd > MAX_ORDER:
                            continue  # lance minimo ja excede o teto por ordem

                        if sig == -1:
                            # VENDER: nunca mais do que as quotas EM CARTEIRA (evita
                            # 'not enough balance'), e nunca menos que o piso de 5.
                            held = self._shares_de(tok)
                            if held < MIN_SHARES:
                                continue  # sem quotas suficientes p/ um SELL valido
                            shares = min(lote_sh, held)
                            if shares < MIN_SHARES:
                                continue
                            self._postar(tok, "SELL", shares, mid, slug=slug_id)
                        elif sig == +1:
                            # COMPRAR: SO com caixa REALIZADO das vendas (rotacao) e
                            # respeitando o teto do jogo. Nunca compra do 'nada'
                            # (era a causa do erro balance:0). Piso de 5 quotas.
                            caixa = self._cash.get(slug_id, 0.0)
                            restante_jogo = max(0.0, MAX_STAKE_GAME - stake_jogo)
                            budget = min(lote_usd, caixa, restante_jogo, teto)
                            if budget < lote_usd - 1e-9:
                                continue  # sem caixa/teto p/ um lote de 5 quotas
                            shares = max(MIN_SHARES, budget / mid)
                            self._postar(tok, "BUY", shares, mid, slug=slug_id)
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
