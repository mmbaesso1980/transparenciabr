# -*- coding: utf-8 -*-
"""
TRAVA DE LUCRO — venda A MERCADO da posicao de EMPATE (Suica x Colombia).

Autorizada pelo Comandante Baesso em 07/07/2026 (jogo 0x0 no min 87', Empate
comprado ~0,44 e valendo ~0,70; travar o lucro antes de um gol de ultima hora).

NAO faz parte do robo. Roda UMA vez, na mao. NAO toca na Renan-YES (token fixo
excluido por seguranca). Reusa PolymarketTrader.postar_ordem, que ja faz a
auto-varredura de signature_type (EOA->Safe->Proxy) — resolve 'maker address
not allowed' sozinho.

Uso na VM:
  cd /opt/wolf/repo
  WOLF_CONFIRMO_VENDA_EMPATE=SIM .venv/bin/python3 wolf_ultra_deploy/vender_empate_agora.py
"""
import os, sys, json, time, urllib.request

for _p in ("/opt/wolf/repo", "/opt/wolf/repo/bridge"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

EMPATE  = "42380288660191542812245553421682685747542075745465207800717921959616754402501"
RENAN   = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
FUNDER  = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
UA      = "TransparenciaBR-engines/1.0"
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


def _pos(token):
    for p in _gj(f"https://data-api.polymarket.com/positions?user={FUNDER}&sizeThreshold=0"):
        if str(p.get("asset")) == token:
            return p
    return None


def _best_bid(token):
    bk = _gj(f"https://clob.polymarket.com/book?token_id={token}")
    bids = bk.get("bids", [])
    if not bids:
        return None, 0.0
    top = max(bids, key=lambda x: float(x["price"]))
    return float(top["price"]), float(top["size"])


def main():
    if os.environ.get("WOLF_CONFIRMO_VENDA_EMPATE") != "SIM":
        print("ABORTADO: defina WOLF_CONFIRMO_VENDA_EMPATE=SIM para confirmar.")
        sys.exit(2)
    # Seguranca dura: nunca opere o token da Renan aqui.
    if EMPATE == RENAN:
        print("ABORTADO: token de venda coincide com a Renan. Nao permitido.")
        sys.exit(9)

    pos = _pos(EMPATE)
    if not pos:
        print("ABORTADO: posicao de Empate nao encontrada."); sys.exit(4)
    tinha = float(pos.get("size", 0) or 0)
    val   = float(pos.get("currentValue", 0) or 0)
    avg   = float(pos.get("avgPrice", 0) or 0)
    print(f"EMPATE ANTES: {tinha:.2f} cotas | US${val:.2f} | avg {avg:.3f}")
    if tinha < 5:
        print("ABORTADO: menos de 5 cotas (piso da Polymarket)."); sys.exit(5)

    bid, liq = _best_bid(EMPATE)
    if not bid or bid <= 0:
        print("ABORTADO: sem best-bid no book."); sys.exit(6)

    # Vende TUDO o que tem (a mercado, no best-bid). Round a 2 casas p/ o piso.
    cotas = round(tinha, 2)
    usd_est = cotas * bid
    print(f"Plano: VENDER {cotas:.2f} cotas @ {bid:.4f} = ~US${usd_est:.2f} "
          f"(best-bid liq US${liq*bid:.0f}). Lucro estimado vs avg: "
          f"US${(bid-avg)*cotas:.2f}.")

    from wolf_trader.polymarket_client import (
        OrdemRequest, Signer, PolymarketTrader, secret_manager_pk_provider,
    )
    from wolf_trader.runner import RunnerConfig, _resolver_funder

    cfg = RunnerConfig()
    if cfg.dry_run:
        print("ABORTADO: DRY_RUN ativo. Rode com DRY_RUN=false."); sys.exit(8)
    funder = _resolver_funder(cfg)
    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)

    # signature_type inicial do servico (1=Proxy). postar_ordem varre sozinho
    # p/ o tipo aceito se cair em 'maker address not allowed'. Vende FAK-like GTC
    # a mercado no best-bid (aceita fill parcial pela liquidez do topo).
    signer = Signer(private_key_provider=pk_provider,
                    funder_address=funder,
                    signature_type=int(os.environ.get("WOLF_SIGNATURE_TYPE", "1")))
    trader = PolymarketTrader(signer=signer, dry_run=False)
    req = OrdemRequest(token_id=EMPATE, lado="SELL", preco=round(bid, 4),
                       size=cotas, tipo="GTC")
    res = trader.postar_ordem(req)
    ok = getattr(res, "ok", False)
    det = getattr(res, "detalhe", res)
    print(f"RESULTADO: ok={ok} | {det}")

    time.sleep(3)
    depois = _pos(EMPATE)
    rest = float(depois.get("size", 0) or 0) if depois else 0.0
    msg = (f"{'✅' if ok else '⚠️'} <b>TRAVA DE LUCRO — Empate</b> (manual)\n"
           f"Vendi {cotas:.2f} cotas @ {bid:.4f} = ~US${usd_est:.2f} "
           f"(lucro vs avg ~US${(bid-avg)*cotas:.2f}).\n"
           f"Empate restante: ~{rest:.1f} cotas. Renan-YES intacta.\n"
           f"Detalhe: {det}")
    _tg(msg); print(msg)
    sys.exit(0 if ok else 7)


if __name__ == "__main__":
    main()
