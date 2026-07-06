# -*- coding: utf-8 -*-
"""
EXCECAO PONTUAL E MANUAL — venda de ~US$10 de Renan-YES p/ dar banca ao teste de hoje.

Autorizada explicitamente pelo Comandante Baesso em 06/07/2026.
NAO faz parte do robo. NAO altera a blindagem: o ULTRA continua NUNCA vendendo Renan
sozinho (flatten_except_renan segue intacto). Este script roda UMA vez, na mao.

Travas de seguranca:
  - Vende no MAXIMO US$ MAX_USD (default 10.50). Recusa qualquer coisa acima.
  - So vende Renan-YES (token fixo). Ignora todo o resto.
  - Confirmacao dupla: exige a env WOLF_CONFIRMO_VENDA_RENAN=SIM.
  - Vende no best-bid real do book (nao a mercado morto).

Uso na VM:
  cd /opt/wolf/repo
  WOLF_CONFIRMO_VENDA_RENAN=SIM .venv/bin/python3 wolf_ultra_deploy/vender_renan_excecao.py
  # opcional: WOLF_USD_ALVO=10  (quanto levantar)
"""
import os, sys, json, time, urllib.request

# Auto-suficiente: garante o PYTHONPATH do repo mesmo quando rodado sem env
# (evita ModuleNotFoundError: No module named 'wolf_trader').
for _p in ("/opt/wolf/repo", "/opt/wolf/repo/bridge"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

RENAN   = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
FUNDER  = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
UA      = "TransparenciaBR-engines/1.0"
USD_ALVO = float(os.environ.get("WOLF_USD_ALVO", "10"))
MAX_USD  = 10.50          # trava rigida: NUNCA vende mais que isto
TG_TOKEN = os.environ.get("WOLF_TG_TOKEN", "").strip()
CHAT_ID  = os.environ.get("WOLF_TG_CHAT", "6483072695").strip()


def _tg(text):
    if not TG_TOKEN:
        print("[tg desativado]", text); return
    try:
        import urllib.parse
        data = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text,
               "parse_mode": "HTML", "disable_web_page_preview": "true"}).encode()
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data), timeout=15).read()
    except Exception as e:
        print("falha tg:", e)


def _gj(u):
    return json.loads(urllib.request.urlopen(
        urllib.request.Request(u, headers={"User-Agent": UA}), timeout=25).read())


def _renan_pos():
    for p in _gj(f"https://data-api.polymarket.com/positions?user={FUNDER}&sizeThreshold=0"):
        if str(p.get("asset")) == RENAN:
            return p
    return None


def _best_bid():
    bk = _gj(f"https://clob.polymarket.com/book?token_id={RENAN}")
    bids = bk.get("bids", [])
    if not bids:
        return None, 0.0
    top = max(bids, key=lambda x: float(x["price"]))
    return float(top["price"]), float(top["size"])


def main():
    if os.environ.get("WOLF_CONFIRMO_VENDA_RENAN") != "SIM":
        print("ABORTADO: defina WOLF_CONFIRMO_VENDA_RENAN=SIM para confirmar a excecao.")
        sys.exit(2)
    if USD_ALVO > MAX_USD:
        print(f"ABORTADO: alvo US${USD_ALVO} acima da trava rigida US${MAX_USD}.")
        sys.exit(3)

    pos = _renan_pos()
    if not pos:
        print("ABORTADO: Renan-YES nao encontrada na carteira."); sys.exit(4)
    tinha = float(pos.get("size", 0) or 0)
    val   = float(pos.get("currentValue", 0) or 0)
    print(f"Renan-YES ANTES: {tinha:.1f} cotas | US${val:.2f}")

    bid, liq = _best_bid()
    if not bid or bid <= 0:
        print("ABORTADO: sem best-bid no book."); sys.exit(5)
    cotas = round(USD_ALVO / bid, 2)
    usd_est = cotas * bid
    if usd_est > MAX_USD:                      # trava dupla
        cotas = round(MAX_USD / bid, 2); usd_est = cotas * bid
    if cotas <= 0 or cotas > tinha:
        print(f"ABORTADO: cotas invalidas ({cotas} vs {tinha} disponiveis)."); sys.exit(6)

    print(f"Plano: VENDER {cotas} cotas @ {bid:.4f} = ~US${usd_est:.2f} "
          f"(best-bid liq US${liq*bid:.0f}). Restarao ~{tinha-cotas:.1f} cotas de Renan.")

    # EXECUCAO REAL via engine do robo (detem a chave; nunca exposta).
    # Reusa RunnerConfig() para PK/funder/projeto, mas monta um Trader proprio
    # porque precisamos VARRER o signature_type correto desta carteira.
    #
    # RAIZ do 'maker address not allowed': a carteira 0xe1B5...64 e o proprio
    # deposit/proxy wallet (data-api retorna proxyWallet == funder). Com sig_type=1
    # (Proxy) o SDK monta um maker que a Polymarket recusa para uma ordem de venda.
    # O robo normal so COMPRA banca politica; esta e a 1a ordem SELL real desta
    # assinatura. Solucao: testar sig_type 0 (EOA), 2 (Safe), 1 (Proxy) e usar o
    # PRIMEIRO que a Polymarket aceitar. Paramos no sucesso (nao vende 2x).
    from wolf_trader.polymarket_client import (
        OrdemRequest, Signer, PolymarketTrader, secret_manager_pk_provider,
    )
    from wolf_trader.runner import RunnerConfig, _resolver_funder

    cfg = RunnerConfig()
    if cfg.dry_run:
        print("ABORTADO: DRY_RUN ativo. Rode com DRY_RUN=false para venda real.")
        sys.exit(8)
    funder = _resolver_funder(cfg)
    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)

    # Ordem de tentativa: EOA -> Safe -> Proxy. Preferencia por 0 porque a
    # carteira e o proprio endereco de deposito (funder == proxyWallet).
    ordem_tipos = [0, 2, 1]
    # Coloca o tipo do servico (default 1) por ultimo, ja tentado hoje sem sucesso.
    req = OrdemRequest(token_id=RENAN, lado="SELL", preco=round(bid, 4),
                       size=cotas, tipo="GTC")
    ok = False
    det = "nenhuma tentativa"
    for st in ordem_tipos:
        rotulo = {0: "0=EOA", 1: "1=Proxy", 2: "2=Safe"}.get(st, str(st))
        print(f"--> Tentando assinatura signature_type={rotulo} ...")
        signer = Signer(private_key_provider=pk_provider,
                        funder_address=funder, signature_type=st)
        trader = PolymarketTrader(signer=signer, dry_run=False)
        res = trader.postar_ordem(req)
        ok = getattr(res, "ok", False)
        det = getattr(res, "detalhe", res)
        print(f"    resultado sig_type={rotulo}: ok={ok} | {det}")
        if ok:
            det = f"[sig_type={rotulo}] {det}"
            print(f"\n*** SUCESSO com signature_type={rotulo}. "
                  f"Defina WOLF_SIGNATURE_TYPE={st} para vendas futuras. ***")
            break
        # Se o erro NAO for de maker/deposit, nao adianta trocar o tipo -> aborta.
        if "maker address not allowed" not in str(det) and "deposit wallet" not in str(det):
            print("    erro nao relacionado a assinatura; parando a varredura.")
            break
    print(f"RESULTADO: ok={ok} | {det}")

    time.sleep(3)
    depois = _renan_pos()
    rest = float(depois.get("size", 0) or 0) if depois else 0.0
    msg = (f"{'✅' if ok else '⚠️'} <b>EXCEÇÃO Renan-YES</b> (manual, autorizada)\n"
           f"Vendi {cotas} cotas @ {bid:.4f} = ~US${usd_est:.2f}\n"
           f"Renan restante: ~{rest:.1f} cotas (blindagem automática segue INTACTA).\n"
           f"Detalhe: {det}")
    _tg(msg); print(msg)
    sys.exit(0 if ok else 7)


if __name__ == "__main__":
    main()
