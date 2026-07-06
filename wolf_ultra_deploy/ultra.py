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
import os, sys, json, time, threading, logging, urllib.parse, urllib.request

log = logging.getLogger("wolf_trader.ultra")

RENAN_TOKEN = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
FUNDER      = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
FEE_BUFFER  = 0.25
MAX_ORDER   = 1000.0
TRIGGER_PCT = 0.0008
FLATTEN_MIN = 85
POLL_S      = 1.0
UA          = "TransparenciaBR-engines/1.0"

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
    m = re.search(r"/(?:event|market)/([a-z0-9\-]+)", link)
    if m:
        return m.group(1).split("?")[0]
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

    # --- infra de ordem via client real ---
    def _cotacao(self, token_id):
        try:
            return self.client.cotacao(token_id)
        except Exception as e:
            log.warning("cotacao %s: %s", token_id[-6:], e); return None

    def _postar(self, token_id, lado, size_shares, preco):
        # importa OrdemRequest do modulo real
        from wolf_trader.polymarket_client import OrdemRequest
        if self.gate_fn and not self.gate_fn(size_shares * preco):
            _tg(f"⛔ Ordem {lado} US${size_shares*preco:.2f} barrada pelo gate de risco.")
            return False
        try:
            req = OrdemRequest(token_id=token_id, lado=lado, preco=round(preco, 4),
                               size=round(size_shares, 2), tipo="GTC")
            res = self.client.postar_ordem(req)
            ok = getattr(res, "ok", False)
            _tg(f"{'💠' if ok else '⚠️'} <b>{lado}</b> {size_shares:.1f}sh @ {preco:.3f} "
                f"tok …{token_id[-6:]} → {getattr(res,'detalhe', res)}")
            return ok
        except Exception as e:
            _tg(f"⚠️ Falha {lado} tok …{token_id[-6:]}: {e}"); return False

    def _teto_usd(self):
        tot = 0.0
        for p in _positions():
            if str(p.get("asset")) == RENAN_TOKEN:
                continue
            tot += float(p.get("currentValue", 0) or 0)
        # divide o caixa entre os jogos ativos p/ evitar dupla-alavancagem
        n = max(1, len(self._threads))
        return max(0.0, min(MAX_ORDER, (tot - FEE_BUFFER) / n))

    def flatten_except_renan(self, motivo=""):
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
            if self._postar(tok, "SELL", size, float(preco)):
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
        _tg(f"🐺 <b>ULTRA em operação</b> — {title}\n"
            f"Resultado: {', '.join(m['outcome'] for m in ml)}\n"
            f"Team to Advance: {', '.join(m['outcome'] for m in tta) or '(n/d)'}\n"
            f"Recolhimento automático no min {FLATTEN_MIN}. Teto dinâmico, máx US$1000. Renan-YES blindada.")
        flattened = False; migrated = False
        while not stop.is_set():
            gs = self._game_state(espn)
            if gs:
                in_extra = gs["period"] >= 5 or "extra" in gs["detail"].lower()
                if in_extra and tta and not migrated:
                    _tg("⏱️ Prorrogação — migrando para <b>Team to Advance</b>.")
                    self.flatten_except_renan("prorrogação: migrar p/ TTA"); migrated = True
                if gs["minute"] is not None and gs["minute"] >= FLATTEN_MIN and not in_extra and not flattened:
                    self.flatten_except_renan(f"min {gs['minute']} (fim de jogo)"); flattened = True
                if gs["state"] == "post":
                    if not flattened and not migrated:
                        self.flatten_except_renan("apito final")
                    _tg(f"🏁 Jogo encerrado — {title}. Ultra finalizando."); break
            active = tta if migrated else ml
            if not flattened or migrated:
                teto = self._teto_usd()
                if teto > 1.0:
                    for mk in active:
                        if stop.is_set(): break
                        sig, mid = self._momentum(mk["token_id"])
                        if mid and 0.02 < mid < 0.98:
                            shares = min(teto, MAX_ORDER) / mid
                            if sig == +1:
                                self._postar(mk["token_id"], "BUY", shares, mid)
                            elif sig == -1:
                                self._postar(mk["token_id"], "SELL", shares, mid)
            stop.wait(POLL_S)
        if not flattened and not migrated:
            self.flatten_except_renan("parada manual")
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
