#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
comprar_suica_10.py — Compra pontual de US$10 em "Suíça win" (FIFWC Suíça x Colômbia 07/07).
Ordem manual do Comandante Baesso. Trava rígida MAX_USD=10.50.
Segue doutrina wolf-agressivo-extremo: ClobClient v2, PYTHONPATH, PK zerada no finally,
varredura de signature_type (EOA->Safe->Proxy), Telegram em 100% das transações.
NÃO toca na Renan-YES. Roda uma vez e não altera nenhuma blindagem do robô.
"""
import os, sys, json, time, urllib.request

# --- PYTHONPATH obrigatório (senão ModuleNotFoundError: devin_bridge/wolf_trader) ---
for p in ("/opt/wolf/repo", "/opt/wolf/repo/bridge"):
    if p not in sys.path:
        sys.path.insert(0, p)

TOKEN_SUICA = "66569899468789141604730928852200840975457837449855481155211476611890307710677"
TOKEN_RENAN = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
MAX_USD = 10.50            # trava rígida
USD_ALVO = float(os.environ.get("WOLF_USD_ALVO", "10"))
CHAT = "6483072695"

def _tg(msg):
    try:
        tok = os.environ.get("WOLF_TG_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("BOT_TOKEN")
        if not tok:
            print("[tg] sem token no ambiente; pulando notificação"); return
        data = urllib.parse.urlencode({"chat_id": CHAT, "text": msg, "parse_mode": "HTML"}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", data=data, timeout=10)
    except Exception as e:
        print(f"[tg] falha: {e}")

def book_ask(token):
    url = f"https://clob.polymarket.com/book?token_id={token}"
    req = urllib.request.Request(url, headers={"User-Agent": "TransparenciaBR-engines/1.0"})
    b = json.load(urllib.request.urlopen(req, timeout=15))
    asks = b.get("asks") or []
    # asks vêm ordenados; menor preço = melhor ask (formato Polymarket: price asc)
    best = None
    for a in asks:
        pr = float(a["price"])
        if best is None or pr < best:
            best = pr
    return best

def main():
    if USD_ALVO > MAX_USD:
        print(f"ABORTO: USD_ALVO {USD_ALVO} > trava {MAX_USD}"); sys.exit(2)
    if TOKEN_SUICA == TOKEN_RENAN:
        print("ABORTO: token de compra coincide com Renan — blindagem"); sys.exit(3)

    from py_clob_client_v2 import ClobClient
    from py_clob_client_v2.order_builder.constants import BUY
    from py_clob_client_v2.clob_types import OrderArgs, OrderType

    pk = os.environ.get("WOLF_PK") or os.environ.get("PK") or os.environ.get("PRIVATE_KEY")
    funder = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
    if not pk:
        print("ABORTO: WOLF_PK não encontrada no ambiente (o systemd injeta; rode via env do serviço)"); sys.exit(4)

    ask = book_ask(TOKEN_SUICA)
    if ask is None:
        print("ABORTO: sem ask no book"); sys.exit(5)
    # preço de compra a mercado: paga o ask com pequena folga, mas nunca acima de 0.90 (faixa viva)
    preco = min(0.90, round(ask + 0.01, 2))
    size = round(USD_ALVO / preco, 2)  # tokens
    print(f"Suíça win | ask={ask} | preco_compra={preco} | size={size} tokens | ~US${round(size*preco,2)}")

    sig_types = [int(os.environ["WOLF_SIGNATURE_TYPE"])] if os.environ.get("WOLF_SIGNATURE_TYPE") else [0, 2, 1]
    ok = False
    try:
        for st in sig_types:
            try:
                cli = ClobClient(host="https://clob.polymarket.com", chain_id=137, key=pk,
                                 signature_type=st, funder=funder, use_server_time=True, retry_on_error=True)
                creds = cli.create_or_derive_api_key()
                cli.set_api_creds(creds)
                args = OrderArgs(price=preco, size=size, side=BUY, token_id=TOKEN_SUICA)
                signed = cli.create_order(args)
                resp = cli.post_order(signed, OrderType.FAK)  # FAK: aceita parcial
                print(f"[sig={st}] resposta: {resp}")
                if resp and (resp.get("success") or resp.get("orderID") or resp.get("status")):
                    ok = True
                    _tg(f"🐺 <b>Compra manual US${USD_ALVO}</b> — Suíça win @ {preco} (~{size} tokens). sig_type={st}. Renan-YES intacta. Freio US$1000/ordem ativo.")
                    print(f"Defina WOLF_SIGNATURE_TYPE={st} no serviço para futuras ordens.")
                    break
            except Exception as e:
                print(f"[sig={st}] falhou: {e}")
                continue
        if not ok:
            _tg("⚠️ Compra US$10 Suíça NÃO executada — nenhum signature_type aceito. Nenhuma ordem enviada.")
            print("FALHA: nenhum signature_type aceito.")
            sys.exit(6)
    finally:
        pk = None

if __name__ == "__main__":
    main()
