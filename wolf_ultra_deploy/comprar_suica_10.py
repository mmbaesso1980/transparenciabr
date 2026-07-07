#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
comprar_suica_10.py — Compra pontual de US$10 em "Suíça win" (FIFWC Suíça x Colômbia 07/07).
Ordem manual do Comandante Baesso. Trava rígida MAX_USD=10.50.

Segue a MESMA via de chave do robô (comprovada em vender_renan_excecao.py):
RunnerConfig() -> secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project) -> Signer -> PolymarketTrader.
A PK vem do Secret Manager; NUNCA é exposta. NÃO toca na Renan-YES.
Roda uma vez e não altera nenhuma blindagem do robô.
"""
import os, sys, time, json, urllib.request

for p in ("/opt/wolf/repo", "/opt/wolf/repo/bridge"):
    if p not in sys.path:
        sys.path.insert(0, p)

TOKEN_SUICA = "66569899468789141604730928852200840975457837449855481155211476611890307710677"
TOKEN_RENAN = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
MAX_USD = 10.50
USD_ALVO = float(os.environ.get("WOLF_USD_ALVO", "10"))
CHAT = "6483072695"

def _tg(msg):
    try:
        tok = os.environ.get("WOLF_TG_TOKEN") or os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("BOT_TOKEN")
        if not tok:
            print("[tg] sem token no ambiente; pulando notificação"); return
        import urllib.parse
        data = urllib.parse.urlencode({"chat_id": CHAT, "text": msg, "parse_mode": "HTML"}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{tok}/sendMessage", data=data, timeout=10)
    except Exception as e:
        print(f"[tg] falha: {e}")

def _book_ask(token):
    url = f"https://clob.polymarket.com/book?token_id={token}"
    req = urllib.request.Request(url, headers={"User-Agent": "TransparenciaBR-engines/1.0"})
    b = json.load(urllib.request.urlopen(req, timeout=15))
    best = None
    for a in (b.get("asks") or []):
        pr = float(a["price"])
        if best is None or pr < best:
            best = pr
    return best

def main():
    # --- travas de segurança ANTES de tocar em qualquer coisa ---
    if USD_ALVO > MAX_USD:
        print(f"ABORTO: USD_ALVO {USD_ALVO} > trava rígida {MAX_USD}"); sys.exit(2)
    if TOKEN_SUICA == TOKEN_RENAN:
        print("ABORTO: token de compra coincide com Renan — blindagem"); sys.exit(3)

    ask = _book_ask(TOKEN_SUICA)
    if ask is None:
        print("ABORTO: sem ask no book"); sys.exit(5)
    # compra a mercado: paga o ask + folga; nunca acima de 0.90 (faixa viva)
    preco = round(min(0.90, ask + 0.01), 2)
    size = round(USD_ALVO / preco, 2)
    usd_est = round(size * preco, 2)
    if usd_est > MAX_USD:
        print(f"ABORTO: US${usd_est} estimado > trava {MAX_USD}"); sys.exit(2)
    print(f"Suíça win | ask={ask} | preco_compra={preco} | size={size} tokens | ~US${usd_est}")

    # --- MESMA via de chave do robô (Secret Manager). PK nunca exposta. ---
    from wolf_trader.polymarket_client import (
        OrdemRequest, Signer, PolymarketTrader, secret_manager_pk_provider,
    )
    from wolf_trader.runner import RunnerConfig, _resolver_funder

    cfg = RunnerConfig()
    if getattr(cfg, "dry_run", False):
        print("ABORTO: DRY_RUN ativo. Rode com DRY_RUN=false para compra real."); sys.exit(8)
    funder = _resolver_funder(cfg)
    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)

    # BUY é o caminho natural do robô; varre sig_type por robustez (para no 1º ok, nunca compra 2x)
    if os.environ.get("WOLF_SIGNATURE_TYPE"):
        ordem_tipos = [int(os.environ["WOLF_SIGNATURE_TYPE"])]
    else:
        ordem_tipos = [0, 2, 1]

    # tipo aceito pelo OrdemRequest: GTC|FOK|GTD. FOK (tudo-ou-nada) — book do ask tem size >> US$10.
    req = OrdemRequest(token_id=TOKEN_SUICA, lado="BUY", preco=preco, size=size, tipo="FOK")
    ok = False
    det = "nenhuma tentativa"
    for st in ordem_tipos:
        rotulo = {0: "0=EOA", 1: "1=Proxy", 2: "2=Safe"}.get(st, str(st))
        print(f"--> Tentando signature_type={rotulo} ...")
        signer = Signer(private_key_provider=pk_provider, funder_address=funder, signature_type=st)
        trader = PolymarketTrader(signer=signer, dry_run=False)
        res = trader.postar_ordem(req)
        ok = getattr(res, "ok", False)
        det = getattr(res, "detalhe", res)
        print(f"    resultado sig_type={rotulo}: ok={ok} | {det}")
        if ok:
            det = f"[sig_type={rotulo}] {det}"
            print(f"\n*** SUCESSO signature_type={rotulo}. Defina WOLF_SIGNATURE_TYPE={st} para ordens futuras. ***")
            break
        if "maker address not allowed" not in str(det) and "deposit wallet" not in str(det):
            print("    erro não relacionado à assinatura; parando a varredura."); break

    msg = (f"{'✅' if ok else '⚠️'} <b>Compra manual US${USD_ALVO}</b> — Suíça win @ {preco} "
           f"(~{size} tokens, ~US${usd_est}).\n"
           f"Detalhe: {det}\nRenan-YES INTACTA. Freio US$1000/ordem ativo.")
    _tg(msg); print(msg)
    sys.exit(0 if ok else 7)

if __name__ == "__main__":
    main()
