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
        # blindagens: estado por jogo/token
        self._pnl = {}         # slug -> fluxo caixa realizado (SELL+ / BUY-)
        self._peak = {}        # slug -> maior lucro visto no jogo
        self._stake = {}       # slug -> exposicao BUY acumulada
        self._last_order = {}  # token_id -> ts ultima ordem (cooldown)

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
            req = OrdemRequest(token_id=token_id, lado=lado, preco=round(preco, 4),
                               size=round(size_shares, 2), tipo="GTC")
            res = self.client.postar_ordem(req)
            ok = getattr(res, "ok", False)
            if ok:
                # contabiliza fluxo de caixa realizado e exposicao do jogo
                self._last_order[token_id] = time.time()
                if slug is not None:
                    self._pnl[slug] = self._pnl.get(slug, 0.0) + (usd if lado == "SELL" else -usd)
                    if lado == "BUY":
                        self._stake[slug] = self._stake.get(slug, 0.0) + usd
            _tg(f"{'💠' if ok else '⚠️'} <b>{lado}</b> {size_shares:.1f}sh @ {preco:.3f} "
                f"tok …{token_id[-6:]} → {getattr(res,'detalhe', res)}")
            return ok
        except Exception as e:
            _tg(f"⚠️ Falha {lado} tok …{token_id[-6:]}: {e}"); return False

    def _cooldown_ok(self, token_id):
        last = self._last_order.get(token_id, 0)
        return (time.time() - last) >= COOLDOWN_S

    def _teto_usd(self):
        tot = 0.0
        for p in _positions():
            if str(p.get("asset")) == RENAN_TOKEN:
                continue
            tot += float(p.get("currentValue", 0) or 0)
        # divide o caixa entre os jogos ativos p/ evitar dupla-alavancagem
        n = max(1, len(self._threads))
        return max(0.0, min(MAX_ORDER, (tot - FEE_BUFFER) / n))

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
        _tg(f"🐺 <b>ULTRA em operação</b> — {title}\n"
            f"Resultado: {', '.join(m['outcome'] for m in ml)}\n"
            f"Team to Advance: {', '.join(m['outcome'] for m in tta) or '(n/d)'}\n"
            f"🛡️ Blindagens: stop-loss US${STOP_LOSS:.0f} | take-profit US${TAKE_PROFIT:.0f} | "
            f"trailing US${TRAIL_GIVEBACK:.1f} | cooldown {COOLDOWN_S:.0f}s | recolhe min {FLATTEN_MIN}.\n"
            f"Máx US$1000/ordem, faixa preço {MIN_PRICE}-{MAX_PRICE}. Renan-YES blindada.")
        flattened = False; migrated = False; parou_por_risco = False
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
                        if mid and MIN_PRICE < mid < MAX_PRICE:  # so preco vivo
                            shares = min(teto, MAX_ORDER) / mid
                            if sig == +1:
                                self._postar(tok, "BUY", shares, mid, slug=slug_id)
                            elif sig == -1:
                                self._postar(tok, "SELL", shares, mid, slug=slug_id)
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
