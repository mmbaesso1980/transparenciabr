# -*- coding: utf-8 -*-
"""
DIAGNOSTICO DEFINITIVO + VENDA US$10 Renan (uma tacada so).

1) Deriva o endereco PUBLICO da chave privada (WOLF_WALLET_PK) e compara com o
   funder 0xe1B5...64. Se NAO baterem em nenhum modo, o problema e a chave -> a
   venda por API nunca vai sair e o caminho e vender no site.
2) Se baterem, tenta a venda de US$10 varrendo signature_type 0/2/1 e para no 1o
   que o Polymarket aceitar.

Seguro: mascara a PK; trava rigida US$10.50; so token Renan; exige confirmacao.
Uso na VM:
  cd /opt/wolf/repo
  DRY_RUN=false PYTHONPATH=/opt/wolf/repo:/opt/wolf/repo/bridge \
    WOLF_CONFIRMO_VENDA_RENAN=SIM WOLF_USD_ALVO=10 \
    .venv/bin/python3 wolf_ultra_deploy/diag_e_vende_renan.py
"""
import os, sys, json, time, urllib.request

for _p in ("/opt/wolf/repo", "/opt/wolf/repo/bridge"):
    if _p not in sys.path:
        sys.path.insert(0, _p)

RENAN  = "93998891488819623915454849994768171534113749478841216025646247933473925258016"
FUNDER = os.environ.get("WOLF_FUNDER", "0xe1B54Ad855E9A7222F119162A9697AC8c35be064")
UA     = "TransparenciaBR-engines/1.0"
USD_ALVO = float(os.environ.get("WOLF_USD_ALVO", "10"))
MAX_USD  = 10.50


def _gj(u):
    return json.loads(urllib.request.urlopen(
        urllib.request.Request(u, headers={"User-Agent": UA}), timeout=25).read())


def _mask(addr):
    return addr[:6] + "..." + addr[-4:] if addr and len(addr) > 12 else "??"


def main():
    if os.environ.get("WOLF_CONFIRMO_VENDA_RENAN") != "SIM":
        print("ABORTADO: defina WOLF_CONFIRMO_VENDA_RENAN=SIM."); sys.exit(2)

    from wolf_trader.runner import RunnerConfig, _resolver_funder
    from wolf_trader.polymarket_client import (
        OrdemRequest, Signer, PolymarketTrader, secret_manager_pk_provider,
    )
    cfg = RunnerConfig()
    print(f"[diag] DRY_RUN={cfg.dry_run} | GCP={cfg.gcp_project} | "
          f"PK_SECRET={cfg.secret_pk} | sig_type_servico={cfg.signature_type}")
    if cfg.dry_run:
        print("ABORTADO: DRY_RUN ativo. Rode com DRY_RUN=false."); sys.exit(8)

    funder = _resolver_funder(cfg)
    print(f"[diag] funder (deposit) = {_mask(funder)}")

    # --- 1) Deriva endereco publico da PK e compara ------------------------
    pk_provider = secret_manager_pk_provider(cfg.secret_pk, cfg.gcp_project)
    try:
        from eth_account import Account
        _pk = pk_provider()
        eoa = Account.from_key(_pk).address
        _pk = None
        print(f"[diag] EOA da chave privada = {_mask(eoa)}")
        if eoa.lower() == funder.lower():
            print("[diag] >>> EOA == funder: assinatura EOA (tipo 0) e a natural.")
        else:
            print("[diag] >>> EOA != funder: carteira e Proxy/Safe do EOA (tipo 1/2).")
    except Exception as e:
        print(f"[diag] nao consegui derivar EOA localmente ({e}); seguindo p/ venda.")

    # --- 2) Prepara venda -------------------------------------------------
    bk = _gj(f"https://clob.polymarket.com/book?token_id={RENAN}")
    bids = bk.get("bids", [])
    if not bids:
        print("ABORTADO: sem bids no book."); sys.exit(5)
    bid = max(float(b["price"]) for b in bids)
    cotas = round(min(USD_ALVO, MAX_USD) / bid, 2)
    usd_est = cotas * bid
    print(f"[plano] VENDER {cotas} cotas @ {bid:.4f} = ~US${usd_est:.2f}")

    req = OrdemRequest(token_id=RENAN, lado="SELL", preco=round(bid, 4),
                       size=cotas, tipo="GTC")

    ok, det = False, "nenhuma tentativa"
    for st in (0, 2, 1):
        rot = {0: "0=EOA", 2: "2=Safe", 1: "1=Proxy"}[st]
        print(f"--> tentando signature_type={rot} ...")
        signer = Signer(private_key_provider=pk_provider,
                        funder_address=funder, signature_type=st)
        res = PolymarketTrader(signer=signer, dry_run=False).postar_ordem(req)
        ok = getattr(res, "ok", False); det = getattr(res, "detalhe", res)
        print(f"    sig_type={rot}: ok={ok} | {det}")
        if ok:
            print(f"\n*** SUCESSO com signature_type={st} ({rot}). "
                  f"FIXAR WOLF_SIGNATURE_TYPE={st} no wolf-trader.service. ***")
            break
        s = str(det)
        if "maker address not allowed" not in s and "deposit wallet" not in s:
            print("    erro NAO e de assinatura; parando varredura."); break

    time.sleep(2)
    try:
        pos = next((p for p in _gj(
            f"https://data-api.polymarket.com/positions?user={FUNDER}&sizeThreshold=0")
            if str(p.get("asset")) == RENAN), None)
        rest = float(pos.get("size", 0) or 0) if pos else 0.0
        print(f"[pos] Renan restante: ~{rest:.1f} cotas")
    except Exception as e:
        print(f"[pos] nao consegui reler posicao: {e}")

    print(f"\nRESULTADO FINAL: ok={ok} | {det}")
    if not ok:
        print("\n!! Se os 3 tipos falharam com 'maker address', a PK na VM NAO e "
              "dona desta carteira. Nesse caso venda os US$10 no site Polymarket.")
    sys.exit(0 if ok else 7)


if __name__ == "__main__":
    main()
