#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
start_ultra_agora.py — START MANUAL IMEDIATO do WOLF ULTRA num jogo especifico.

Por que existe:
  O patch injeta arm_autostart(self.client) no runner, mas o Runner nao expoe
  self.client (tem self.engine.reader + self.engine.trader separados). Logo o
  /startwolfultra via Telegram pode nao instanciar o engine. Este script sobe o
  ULTRA de forma AUTONOMA e DIRETA, sem depender do Telegram nem do gate de
  kickoff do AutoScheduler — atende a ordem do Comandante: "start now".

O que faz (ordem do dono do codigo — ignora espera de apito):
  1. Monta o MESMO client do robo (reader.cotacao + trader.postar_ordem) via
     RunnerConfig + Secret Manager. PK NUNCA exposta.
  2. Instancia UltraEngine com gate de risco (freio US$1000/ordem herdado).
  3. Assimila o(s) jogo(s) de auto_games.json (default) OU o link passado em argv.
  4. Chama ue.start(cfg) => worker daemon opera JA (loop _run, sem gate de apito).
  5. Mantem o processo vivo em foreground; os workers recolhem antes do fim
     (FLATTEN_MIN + estado post da ESPN) e a Renan-YES fica SEMPRE blindada.

Uso na VM (com env do serviço carregado):
  /opt/wolf/repo/.venv/bin/python3 wolf_ultra_deploy/start_ultra_agora.py
  # ou link explicito:
  /opt/wolf/repo/.venv/bin/python3 wolf_ultra_deploy/start_ultra_agora.py "https://polymarket.com/pt/sports/world-cup/fifwc-che-col-2026-07-07"

Parar: enviar /stopwolfultra no Telegram, ou Ctrl-C / matar ESTE processo
  (workers sao daemon; ao encerrar o processo, recolha manualmente se preciso).
"""
import os, sys, json, time, signal

REPO = "/opt/wolf/repo"
for p in (REPO, os.path.join(REPO, "bridge")):
    if p not in sys.path:
        sys.path.insert(0, p)

AUTO_GAMES = os.path.join(REPO, "wolf_ultra_deploy", "auto_games.json")


def _log(m):
    print(f"[start_ultra_agora] {m}", flush=True)


def montar_client():
    """Objeto unico com .cotacao() (reader) e .postar_ordem() (trader), como o
    UltraEngine espera. Reusa exatamente a via de credenciais do robo."""
    from wolf_trader.polymarket_client import PolymarketReader, Signer, PolymarketTrader
    from wolf_trader.runner import RunnerConfig, _resolver_funder
    from wolf_trader.polymarket_client import secret_manager_pk_provider

    cfg = RunnerConfig()
    reader = PolymarketReader()
    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)
    funder = _resolver_funder(cfg)
    signer = Signer(
        private_key_provider=pk_provider,
        funder_address=funder,
        signature_type=cfg.signature_type,
    )
    trader = PolymarketTrader(signer=signer, dry_run=cfg.dry_run)

    class _UltraClient:
        """Shim: expoe cotacao (reader) + postar_ordem (trader) num objeto so."""
        def cotacao(self, token_id):
            return reader.cotacao(token_id)

        def postar_ordem(self, req):
            return trader.postar_ordem(req)

    _log(f"client montado | funder=...{funder[-6:]} | sig_type={cfg.signature_type} | dry_run={cfg.dry_run}")
    return _UltraClient()


def gate_1000(usd):
    """Freio permanente do Comandante: nenhuma ordem > US$1000."""
    return float(usd) <= 1000.0


def carregar_jogos():
    argv_link = sys.argv[1].strip() if len(sys.argv) > 1 and sys.argv[1].strip() else None
    if argv_link:
        return [{"link": argv_link, "espn_event_id": None}]
    try:
        if os.path.exists(AUTO_GAMES):
            data = json.load(open(AUTO_GAMES))
            if data:
                return data
    except Exception as e:
        _log(f"falha lendo auto_games.json: {e}")
    return []


def main():
    from wolf_trader.ultra import UltraEngine, assimilar_jogo

    client = montar_client()
    engine = UltraEngine(client, gate_fn=gate_1000)

    jogos = carregar_jogos()
    if not jogos:
        _log("Nenhum jogo para operar (auto_games.json vazio e sem link em argv). Abortando.")
        sys.exit(2)

    iniciados = []
    for it in jogos:
        if isinstance(it, dict):
            link = it.get("link"); eid = it.get("espn_event_id")
        else:
            link = it; eid = None
        cfg, err = assimilar_jogo(link, eid)
        if err:
            _log(f"assimilar falhou ({link}): {err}")
            continue
        if engine.start(cfg):
            iniciados.append(cfg.get("title", link))
            _log(f"ULTRA operando JA: {cfg.get('title', link)} (moneyline={len(cfg.get('moneyline', []))} tokens)")

    if not iniciados:
        _log("Nenhum jogo iniciado. Abortando.")
        sys.exit(3)

    # notifica Telegram nativamente (o proprio engine ja notifica cada ordem)
    try:
        from wolf_trader.ultra import _tg
        _tg("🐺 <b>WOLF ULTRA — START MANUAL IMEDIATO</b> (ordem do Comandante, sem espera de apito):\n"
            + "\n".join("• " + x for x in iniciados)
            + "\n\nBlindagens ativas: stop -5 | take +6 | trailing 2.5 | faixa 0.12–0.90 | recolhe antes do fim | Renan-YES BLINDADA. "
              "Freio US$1000/ordem e teto por jogo ativos.")
    except Exception as e:
        _log(f"telegram notify falhou (nao critico): {e}")

    _log(f"{len(iniciados)} jogo(s) em operacao. Processo vivo (workers daemon). Ctrl-C ou /stopwolfultra para parar.")

    # mantem o processo vivo — os workers sao threads daemon
    stop = {"v": False}

    def _sig(_a, _b):
        stop["v"] = True
    signal.signal(signal.SIGINT, _sig)
    signal.signal(signal.SIGTERM, _sig)

    # Vigia: mantem o processo vivo enquanto ao menos 1 worker roda. Se TODOS
    # os workers morrerem MAS o jogo ainda estiver vivo (nao chegou ao 'post'
    # pela ESPN e nenhuma trava de risco disparou), RELIGA o(s) jogo(s) — o
    # Comandante e OWNER e a diretiva e operar AGORA, sem espera de apito.
    # So encerra de fato quando o jogo resolve ou uma trava de risco para tudo.
    import time as _t
    ciclos = 0
    try:
        while not stop["v"]:
            _t.sleep(5)
            ciclos += 1
            alive = [s for s, t in engine._threads.items() if t and t.is_alive()]
            if not alive:
                # Reavalia: algum jogo ainda esta vivo? Se sim e nao houve trava,
                # religa. Se resolvido, encerra de vez.
                religou = False
                for it in jogos:
                    link = it.get("link") if isinstance(it, dict) else it
                    eid = it.get("espn_event_id") if isinstance(it, dict) else None
                    try:
                        from wolf_trader.ultra import _espn_kickoff
                        _ko, st = _espn_kickoff(eid)
                    except Exception:
                        st = None
                    if st == "post":
                        continue  # jogo acabou -> nao religa
                    slug_j = None
                    try:
                        from wolf_trader.ultra import _slug_from_link
                        slug_j = _slug_from_link(link)
                    except Exception:
                        slug_j = None
                    if slug_j and slug_j in getattr(engine, "_risk_stopped", set()):
                        # parou por TRAVA de risco (stop/take/trailing) -> respeita, NAO religa
                        continue
                    cfg2, err2 = assimilar_jogo(link, eid)
                    if err2 or not cfg2:
                        continue
                    if engine.start(cfg2):
                        religou = True
                        _log(f"Worker havia parado; RELIGADO (jogo ainda vivo): {cfg2.get('title', link)}")
                if not religou:
                    _log("Todos os workers encerraram e nenhum jogo vivo p/ religar. Saindo.")
                    break
            # heartbeat a cada ~60s p/ o Comandante ver que o robo esta VIVO
            if ciclos % 12 == 0:
                try:
                    from wolf_trader.ultra import _tg
                    ativos = engine.ativos()
                    _tg("💓 <b>WOLF ULTRA vivo</b> — operando: " + (", ".join(ativos) or "(nenhum)")
                        + ". Renan-YES blindada.")
                except Exception:
                    pass
    finally:
        _log("Encerrando start_ultra_agora. Renan-YES permanece intacta (engine nunca a vende).")


if __name__ == "__main__":
    main()
