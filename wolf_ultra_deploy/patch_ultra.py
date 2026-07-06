#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
patch_ultra.py — aplica o modo ULTRA ao robo wolf_trader EXISTENTE, de forma idempotente.

Faz:
  1. grava wolf_trader/ultra.py (conteudo embutido pelo instalador .sh via arquivo ao lado)
  2. adiciona TipoComando.START_WOLF/STOP_WOLF/START_ULTRA/STOP_ULTRA + mapeia no _COMANDOS_MAP
  3. injeta o tratamento desses comandos em runner._tratar_comando()
  4. valida sintaxe (py_compile) de tudo; se falhar, RESTAURA backup e aborta.

Roda como root na VM: sudo /opt/wolf/repo/.venv/bin/python3 patch_ultra.py
Backups: <arquivo>.bak_ultra
"""
import os, sys, py_compile, shutil, re, time

REPO = "/opt/wolf/repo"
PKG  = os.path.join(REPO, "wolf_trader")
CT   = os.path.join(PKG, "comando_telegram.py")
RUN  = os.path.join(PKG, "runner.py")
ULTRA_SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ultra.py")  # ao lado
ULTRA_DST = os.path.join(PKG, "ultra.py")

MARK = "# >>> WOLF ULTRA PATCH >>>"
END  = "# <<< WOLF ULTRA PATCH <<<"

def backup(p):
    b = p + ".bak_ultra"
    if not os.path.exists(b):
        shutil.copy2(p, b)
    return b

def restore(p):
    b = p + ".bak_ultra"
    if os.path.exists(b):
        shutil.copy2(b, p)

def already(txt):
    return MARK in txt

# ---------- 1. ultra.py ----------
def install_ultra():
    if not os.path.exists(ULTRA_SRC):
        print("ERRO: ultra.py fonte nao encontrado ao lado do patch."); sys.exit(3)
    shutil.copy2(ULTRA_SRC, ULTRA_DST)
    print(f"[1/4] ultra.py instalado em {ULTRA_DST}")

# ---------- 2. comando_telegram.py ----------
def patch_comando():
    txt = open(CT, encoding="utf-8").read()
    if already(txt):
        print("[2/4] comando_telegram.py ja contem o patch (idempotente)."); return
    backup(CT)

    # 2a. adiciona membros ao Enum TipoComando (procura 'class TipoComando')
    #     estrategia robusta: adiciona novos nomes logo apos a linha 'class TipoComando'
    m = re.search(r"class\s+TipoComando\b.*?:\n", txt)
    if not m:
        print("ERRO: nao achei 'class TipoComando' em comando_telegram.py"); sys.exit(4)
    ins_enum = (
        f"    {MARK}\n"
        "    START_WOLF = \"start_wolf\"\n"
        "    STOP_WOLF = \"stop_wolf\"\n"
        "    START_ULTRA = \"start_ultra\"\n"
        "    STOP_ULTRA = \"stop_ultra\"\n"
        "    ULTRA_LINK = \"ultra_link\"\n"
        f"    {END}\n"
    )
    idx = m.end()
    txt = txt[:idx] + ins_enum + txt[idx:]

    # 2b. mapeia palavras no _COMANDOS_MAP (adiciona entradas antes do fechamento '}')
    #     acha o dict _COMANDOS_MAP = { ... }
    mm = re.search(r"_COMANDOS_MAP\s*=\s*\{", txt)
    if not mm:
        print("ERRO: nao achei _COMANDOS_MAP"); sys.exit(5)
    # encontra o '}' que fecha esse dict
    depth = 0; j = mm.end() - 1
    while j < len(txt):
        if txt[j] == "{": depth += 1
        elif txt[j] == "}":
            depth -= 1
            if depth == 0: break
        j += 1
    add_map = (
        f"    {MARK}\n"
        "    \"startwolf\": TipoComando.START_WOLF,\n"
        "    \"stopwolf\": TipoComando.STOP_WOLF,\n"
        "    \"startwolfultra\": TipoComando.START_ULTRA,\n"
        "    \"stopwolfultra\": TipoComando.STOP_ULTRA,\n"
        f"    {END}\n"
    )
    txt = txt[:j] + add_map + txt[j:]

    # 2c. captura de LINK: quando ha ultra pendente, texto vira comando ULTRA_LINK.
    #     Patch em interpretar_comando: se texto contem 'polymarket.com' ou flag pendente,
    #     devolve ComandoOperacional(ULTRA_LINK, argumento=texto).
    #     Inserimos logo apos o docstring da funcao.
    pat = re.search(r"(def interpretar_comando\(texto: str\)[^\n]*\n(?:\s*\"\"\".*?\"\"\"\n)?)", txt, re.S)
    if pat:
        link_hook = (
            f"    {MARK}\n"
            "    import os as _os\n"
            "    _pending = _os.path.exists('/tmp/wolf_ctl/pending_link.flag')\n"
            "    _low = texto.strip().lower()\n"
            "    if ('polymarket.com' in _low) or (_pending and _low and not _low.lstrip('/').split(' ')[0] in _COMANDOS_MAP):\n"
            "        return ComandoOperacional(tipo=TipoComando.ULTRA_LINK, argumento=texto.strip())\n"
            f"    {END}\n"
        )
        txt = txt[:pat.end()] + link_hook + txt[pat.end():]

    open(CT, "w", encoding="utf-8").write(txt)
    print("[2/4] comando_telegram.py patchado (enum + map + captura de link).")

# ---------- 3. runner.py ----------
def patch_runner():
    txt = open(RUN, encoding="utf-8").read()
    if already(txt):
        print("[3/4] runner.py ja contem o patch (idempotente)."); return
    backup(RUN)

    # 3a. garante import do ultra + instancia do UltraEngine no __init__ do runner.
    #     Inserimos um bloco de import no topo (apos os imports do wolf_trader).
    imp = (
        f"\n{MARK}\n"
        "try:\n"
        "    from wolf_trader.ultra import UltraEngine, assimilar_jogo, _tg as _ultra_tg\n"
        "except Exception as _e:\n"
        "    UltraEngine = None\n"
        "    def assimilar_jogo(_l): return None, 'ultra indisponível'\n"
        "    def _ultra_tg(_m): pass\n"
        f"{END}\n"
    )
    # insere apos a ultima linha 'from wolf_trader'
    last = 0
    for m in re.finditer(r"^from wolf_trader.*$", txt, re.M):
        last = m.end()
    if last:
        txt = txt[:last] + "\n" + imp + txt[last:]
    else:
        txt = imp + txt

    # 3b. handler central: uma funcao que trata os comandos ultra.
    #     A anexamos ao final da classe do runner via metodo _ultra_handle,
    #     e chamamos dentro de _tratar_comando.
    #     Descobrimos a indentacao do metodo _tratar_comando.
    mt = re.search(r"^(\s*)def _tratar_comando\(self, cmd[^\n]*\n", txt, re.M)
    if not mt:
        print("ERRO: nao achei runner._tratar_comando"); sys.exit(6)
    indent = mt.group(1)
    body_indent = indent + "    "
    hook = (
        f"{body_indent}{MARK}\n"
        f"{body_indent}from wolf_trader.comando_telegram import TipoComando as _TC\n"
        f"{body_indent}import os as _os, json as _json\n"
        f"{body_indent}_t = getattr(cmd, 'tipo', None)\n"
        f"{body_indent}if _t in (_TC.START_WOLF, _TC.STOP_WOLF, _TC.START_ULTRA, _TC.STOP_ULTRA, _TC.ULTRA_LINK):\n"
        f"{body_indent}    self._ultra_handle(cmd); return\n"
        f"{body_indent}{END}\n"
    )
    txt = txt[:mt.end()] + hook + txt[mt.end():]

    # 3c. injeta o metodo _ultra_handle logo apos a definicao de _tratar_comando (mesma indent de metodo)
    #     acha o fim aproximado do metodo _tratar_comando: proxima 'def ' na mesma indentacao
    after = mt.end()
    nxt = re.search(rf"\n{indent}def ", txt[after:])
    insert_at = after + (nxt.start() if nxt else 0)
    method = (
        f"\n{indent}{MARK}\n"
        f"{indent}def _ultra_handle(self, cmd):\n"
        f"{indent}    from wolf_trader.comando_telegram import TipoComando as _TC\n"
        f"{indent}    import os as _os, json as _json\n"
        f"{indent}    t = getattr(cmd, 'tipo', None)\n"
        f"{indent}    arg = getattr(cmd, 'argumento', '') or ''\n"
        f"{indent}    if not hasattr(self, '_ultra_engine') or self._ultra_engine is None:\n"
        f"{indent}        if UltraEngine is None:\n"
        f"{indent}            _ultra_tg('⚠️ Módulo ultra indisponível.'); return\n"
        f"{indent}        gate = getattr(self, 'engine', None)\n"
        f"{indent}        gate_fn = None\n"
        f"{indent}        self._ultra_engine = UltraEngine(self.client, gate_fn=gate_fn)\n"
        f"{indent}    ue = self._ultra_engine\n"
        f"{indent}    if t == _TC.START_WOLF:\n"
        f"{indent}        self._pausado = False\n"
        f"{indent}        _ultra_tg('✅ /startwolf — robô normal ATIVO (política brasileira).'); return\n"
        f"{indent}    if t == _TC.STOP_WOLF:\n"
        f"{indent}        ue.stop(); self._pausado = True\n"
        f"{indent}        _ultra_tg('🛑 /stopwolf — operações pausadas. Renan-YES intacta.'); return\n"
        f"{indent}    if t == _TC.START_ULTRA:\n"
        f"{indent}        _auto = []\n"
        f"{indent}        _af = '/opt/wolf/repo/wolf_ultra_deploy/auto_games.json'\n"
        f"{indent}        try:\n"
        f"{indent}            if _os.path.exists(_af): _auto = _json.load(open(_af))\n"
        f"{indent}        except Exception: _auto = []\n"
        f"{indent}        if _auto:\n"
        f"{indent}            _ok = []\n"
        f"{indent}            for _it in _auto:\n"
        f"{indent}                if isinstance(_it, dict): _lnk=_it.get('link'); _eid=_it.get('espn_event_id')\n"
        f"{indent}                else: _lnk=_it; _eid=None\n"
        f"{indent}                _cfg, _e = assimilar_jogo(_lnk, _eid)\n"
        f"{indent}                if _e: _ultra_tg('⚠️ '+str(_e)); continue\n"
        f"{indent}                if ue.start(_cfg): _ok.append(_cfg.get('title', _lnk))\n"
        f"{indent}            if _ok: _ultra_tg('🐺 /startwolfultra — jogos de hoje em operação SIMULTÂNEA:\\n• '+chr(10).join('• '+x for x in _ok)); return\n"
        f"{indent}        open('/tmp/wolf_ctl/pending_link.flag','w').write('1')\n"
        f"{indent}        _ultra_tg('🐺 /startwolfultra — envie agora o LINK do jogo na Polymarket (…/event/&lt;slug&gt;).'); return\n"
        f"{indent}    if t == _TC.ULTRA_LINK:\n"
        f"{indent}        try: _os.remove('/tmp/wolf_ctl/pending_link.flag')\n"
        f"{indent}        except Exception: pass\n"
        f"{indent}        _ultra_tg('🔎 Assimilando o jogo...')\n"
        f"{indent}        cfg, err = assimilar_jogo(arg)\n"
        f"{indent}        if err: _ultra_tg('⚠️ '+err); return\n"
        f"{indent}        ue.start(cfg); return\n"
        f"{indent}    if t == _TC.STOP_ULTRA:\n"
        f"{indent}        ue.stop()\n"
        f"{indent}        _ultra_tg('🛑 /stopwolfultra — ultra encerrado, posições recolhidas (exceto Renan-YES).'); return\n"
        f"{indent}{END}\n"
    )
    txt = txt[:insert_at] + method + txt[insert_at:]

    open(RUN, "w", encoding="utf-8").write(txt)
    print("[3/4] runner.py patchado (import + hook + _ultra_handle).")

# ---------- 4. validacao ----------
def validate_or_rollback():
    ok = True
    for p in (ULTRA_DST, CT, RUN):
        try:
            py_compile.compile(p, doraise=True)
        except Exception as e:
            print(f"ERRO de sintaxe em {p}: {e}"); ok = False
    if not ok:
        print(">>> ROLLBACK: restaurando backups.")
        restore(CT); restore(RUN)
        try: os.remove(ULTRA_DST)
        except Exception: pass
        sys.exit(7)
    print("[4/4] sintaxe validada em ultra.py, comando_telegram.py, runner.py.")

def main():
    if not os.path.isdir(PKG):
        print(f"ERRO: {PKG} nao existe."); sys.exit(2)
    install_ultra()
    patch_comando()
    patch_runner()
    validate_or_rollback()
    print("PATCH ULTRA aplicado com sucesso.")

if __name__ == "__main__":
    main()
