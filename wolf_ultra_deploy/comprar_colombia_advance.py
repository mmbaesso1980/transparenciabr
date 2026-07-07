# -*- coding: utf-8 -*-
"""
COMPRA LIMITADA — "Colombia: Team to Advance" (Suica x Colombia, 07/07/2026).

Autorizada pelo Comandante Baesso: comprar a posicao "Colombia passa de fase"
com teto RIGIDO de US$12. NAO usa caixa alem disso. Jogo em prorrogacao 0x0;
esta e a aposta de que a Colombia avanca (vale na prorrogacao E nos penaltis,
diferente do moneyline "Colombia vence" que resolve NO se for aos penaltis).

NAO faz parte do robo. Roda UMA vez, na mao. NAO toca na Renan-YES (token fixo
excluido por seguranca). Reusa PolymarketTrader.postar_ordem, que ja faz a
auto-varredura de signature_type (EOA->Safe->Proxy) — resolve 'maker address
not allowed' sozinho.

Uso na VM:
  cd /opt/wolf/repo
  WOLF_CONFIRMO_COMPRA_COL=SIM .venv/bin/python3 wolf_ultra_deploy/comprar_colombia_advance.py
"""
import os, sys, json, time, urllib.request, urllib.parse

for _p in ("/opt/wolf/repo", "/opt/wolf/repo/bridge"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Colombia: Team to Advance (outcome "Colombia" do mercado team-to-advance)
COL_ADV = "43403511484487260199353011955966691622823156163406003831643155601659693308147"
RENAN   = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
FUNDER  = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
UA      = "TransparenciaBR-engines/1.0"
TG_TOKEN = os.environ.get("WOLF_TG_TOKEN", "").strip()
CHAT_ID  = os.environ.get("WOLF_TG_CHAT", "6483072695").strip()

# Trava RIGIDA de caixa: nunca gasta mais que isto (default US$12).
MAX_USD = float(os.environ.get("WOLF_MAX_USD_COL", "12.0"))
# Folga sobre o best-ask p/ garantir cruzamento (evita ordem parada).
SLIP    = float(os.environ.get("WOLF_SLIP_COL", "0.01"))


def _tg(text):
    if not TG_TOKEN:
        print("[tg desativado]", text); return
    try:
        data = urllib.parse.urlencode({"chat_id": CHAT_ID, "text": text,
               "parse_mode": "HTML", "disable_web_page_preview": "true"}).encode()
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data), timeout=15).read()
    except Exception as e:
        print("falha tg:", e)


def _gj(u):
    return json.loads(urllib.request.urlopen(
        urllib.request.Request(u, headers={"User-Agent": UA}), timeout=25).read())


def _pos(token):
    for p in _gj(f"https://data-api.polymarket.com/positions?user={FUNDER}&sizeThreshold=0"):
        if str(p.get("asset")) == token:
            return p
    return None


def _best_ask(token):
    bk = _gj(f"https://clob.polymarket.com/book?token_id={token}")
    asks = bk.get("asks", [])
    if not asks:
        return None, 0.0
    top = min(asks, key=lambda x: float(x["price"]))
    return float(top["price"]), float(top["size"])


def main():
    if os.environ.get("WOLF_CONFIRMO_COMPRA_COL") != "SIM":
        print("ABORTADO: defina WOLF_CONFIRMO_COMPRA_COL=SIM para confirmar.")
        sys.exit(2)
    # Seguranca dura: nunca opere o token da Renan aqui.
    if COL_ADV == RENAN:
        print("ABORTADO: token de compra coincide com a Renan. Nao permitido.")
        sys.exit(9)
    if MAX_USD <= 0 or MAX_USD > 12.0:
        print(f"ABORTADO: teto US${MAX_USD:.2f} invalido (deve ser 0<x<=12).")
        sys.exit(3)

    ask, liq = _best_ask(COL_ADV)
    if not ask or ask <= 0:
        print("ABORTADO: sem best-ask no book."); sys.exit(6)

    # Preco de compra: best-ask + folga, capado em 0.99.
    preco = min(0.99, round(ask + SLIP, 3))
    # Cotas dentro do teto RIGIDO de caixa: floor(MAX_USD / preco).
    cotas = int(MAX_USD / preco)
    if cotas < 5:
        print(f"ABORTADO: teto US${MAX_USD:.2f} @ {preco:.3f} da <5 cotas (piso Polymarket).")
        sys.exit(5)
    custo_max = round(cotas * preco, 2)
    if custo_max > MAX_USD + 1e-6:
        cotas -= 1
        custo_max = round(cotas * preco, 2)
    print(f"Plano: COMPRAR {cotas} cotas Colombia-advance @ {preco:.3f} "
          f"= ~US${custo_max:.2f} (teto US${MAX_USD:.2f}; best-ask {ask:.3f}, "
          f"liq topo US${liq*ask:.0f}).")

    from wolf_trader.polymarket_client import (
        OrdemRequest, Signer, PolymarketTrader, secret_manager_pk_provider,
    )
    from wolf_trader.runner import RunnerConfig, _resolver_funder

    cfg = RunnerConfig()
    if cfg.dry_run:
        print("ABORTADO: DRY_RUN ativo. Rode com DRY_RUN=false."); sys.exit(8)
    funder = _resolver_funder(cfg)
    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)

    signer = Signer(private_key_provider=pk_provider,
                    funder_address=funder,
                    signature_type=int(os.environ.get("WOLF_SIGNATURE_TYPE", "1")))
    trader = PolymarketTrader(signer=signer, dry_run=False)
    req = OrdemRequest(token_id=COL_ADV, lado="BUY", preco=preco,
                       size=float(cotas), tipo="GTC")
    res = trader.postar_ordem(req)
    ok = getattr(res, "ok", False)
    det = getattr(res, "detalhe", res)
    print(f"RESULTADO: ok={ok} | {det}")

    time.sleep(3)
    depois = _pos(COL_ADV)
    tem = float(depois.get("size", 0) or 0) if depois else 0.0
    valn = float(depois.get("currentValue", 0) or 0) if depois else 0.0
    msg = (f"{'✅' if ok else '⚠️'} <b>COMPRA — Colombia passa de fase</b> (manual)\n"
           f"Comprei {cotas} cotas @ {preco:.3f} = ~US${custo_max:.2f} "
           f"(teto rigido US${MAX_USD:.2f}).\n"
           f"Posicao Colombia-advance: ~{tem:.1f} cotas (US${valn:.2f}).\n"
           f"Renan-YES intacta. Freio US$1000/ordem ativo.\n"
           f"Detalhe: {det}")
    _tg(msg); print(msg)
    sys.exit(0 if ok else 7)


if __name__ == "__main__":
    main()
