#!/usr/bin/env python3
"""
Remediação atômica: rename de codinome interno ASMODEUS/Goetia para nomenclatura
pública AURORA em todo o repo, conforme regra inviolável da `transparenciabr-lei`:

    "Em código/UI público: nunca expor codinomes internos (Asmodeus, Goetia, demônios)."

Estratégia:
  1. Identifiers (ASMODEUS_*, *_ASMODEUS, audit_asmodeus_*) → AURORA equivalente
  2. Chave de campo `score_asmodeus` → `score_aurora` (com fallback em consumidores)
  3. Pasta `frontend/public/asmodeus/` → `frontend/public/sala-de-guerra/`
  4. Matriz Goetia (12 demônios) → 12 prismas neutros
  5. Strings de UI "ASMODEUS ENGINE ..." → "AURORA ENGINE ..."

NÃO ALTERA: engines/incident/sentinels.{yaml,json}, severity_map.{yaml,json}
(esses são definições do próprio detector — devem manter os termos para detectar)

Uso:
    cd <repo_root>
    python3 scripts/redact_internal_codename.py
"""
from __future__ import annotations
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Mapa de demônios Goetia → prismas neutros
GOETIA_TO_PRISMA = {
    "Bael": "Prisma 1",
    "Agares": "Prisma 2",
    "Vassago": "Prisma 3",
    "Gamigin": "Prisma 4",
    "Marbas": "Prisma 5",
    "Valefor": "Prisma 6",
    "Amon": "Prisma 7",
    "Barbatos": "Prisma 8",
    "Paim": "Prisma 9",
    "Buer": "Prisma 10",
    "Gusion": "Prisma 11",
    "Asmodeus": "Prisma 12",
}

# Substituições por identificador (case-sensitive)
IDENT_REPL = [
    ("ASMODEUS_VERTEX_MATRIX",      "AURORA_VERTEX_MATRIX"),
    ("ASMODEUS_SUPREME_AGENT_ID",   "AURORA_SUPREME_AGENT_ID"),
    ("ASMODEUS_GEMINI_MODEL",       "AURORA_GEMINI_MODEL"),
    ("ASMODEUS_SYSTEM_INSTRUCTION", "AURORA_SYSTEM_INSTRUCTION"),
    ("SYSTEM_INSTRUCTION_ASMODEUS", "SYSTEM_INSTRUCTION_AURORA"),
    ("audit_asmodeus_triade",       "audit_aurora_triade"),
    ("auditoria_asmodeus_triade",   "auditoria_aurora_triade"),
    ("pickAsmodeusScore",           "pickAuroraScore"),
    ("asmodeus_adapter_base",       "aurora_adapter_base"),
    # Strings completas UI
    ('"ASMODEUS ENGINE — INFERNO EDITION v3"',  '"AURORA ENGINE — FORENSIC EDITION v3"'),
    ("ASMODEUS ENGINE — INFERNO EDITION v3",    "AURORA ENGINE — FORENSIC EDITION v3"),
    ("A.S.M.O.D.E.U.S.",                        "AURORA"),
    # protocolos
    ("protocolo_asmodeus",                      "protocolo_aurora"),
]

# Chave de campo Firestore/BigQuery: `score_asmodeus` → `score_aurora`
# Tratada SEPARADAMENTE: nos consumidores (leitura), introduz fallback;
# nos geradores (escrita), renomeia.
SCORE_KEY = "score_asmodeus"
SCORE_KEY_NEW = "score_aurora"

# Excluir do scan (são definições do detector e backups)
EXCLUDE_PATHS = {
    "engines/incident/sentinels.yaml",
    "engines/incident/sentinels.json",
    "engines/incident/severity_map.yaml",
    "engines/incident/severity_map.json",
    "scripts/redact_internal_codename.py",
}

# Pastas excluídas
EXCLUDE_DIRS = {".git", "node_modules", "venv", ".venv", "dist", "build", "__pycache__"}


def is_excluded(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if rel in EXCLUDE_PATHS:
        return True
    parts = rel.split("/")
    return any(p in EXCLUDE_DIRS for p in parts)


def scan_files(extensions: list[str]) -> list[Path]:
    out: list[Path] = []
    for ext in extensions:
        out.extend(p for p in ROOT.rglob(f"*{ext}") if not is_excluded(p))
    return out


def apply_replacements(text: str) -> tuple[str, int]:
    """Aplica IDENT_REPL e substituição de matriz Goetia."""
    count = 0
    for old, new in IDENT_REPL:
        if old in text:
            count += text.count(old)
            text = text.replace(old, new)
    # Goetia: só substituir dentro de campos { goetia: "Nome" } ou strings isoladas
    # Para minimizar impacto, substituo aspas-delimitado, padrão JSON/JS
    for demon, prisma in GOETIA_TO_PRISMA.items():
        # padrões: "Bael", 'Bael', :Bael<EOL>
        for quote in ('"', "'"):
            pat = f'{quote}{demon}{quote}'
            if pat in text:
                count += text.count(pat)
                text = text.replace(pat, f'{quote}{prisma}{quote}')
    # rename de "goetia:" chave do objeto para "prisma:"
    text2 = re.sub(r'\bgoetia\s*:', 'prisma:', text)
    count += (text.count('goetia:') if 'goetia:' in text else 0)
    text = text2
    return text, count


def handle_score_key_in_file(path: Path, text: str) -> tuple[str, int]:
    """
    score_asmodeus aparece em:
      - frontend/src/hooks/useKPIsParlamentar.js:  const rawAsm = kpis.score_asmodeus;
        → trocar para fallback: kpis.score_aurora ?? kpis.score_asmodeus
      - frontend/src/pages/PoliticoPage.jsx:       politico?.score_asmodeus ??
        → idem, manter ambos
      - frontend/src/components/dossie/DossiePDFContent.jsx: politico?.score_asmodeus ??
        → idem
      - functions/src/dossie/gerarDossieOnDemandCallable.js: "score_asmodeus",
        (lista de campos a ler) → adicionar "score_aurora" como primário, manter "score_asmodeus" como legado
    """
    count = 0
    # 1) acesso direto kpis.score_asmodeus / x.score_asmodeus → fallback
    pat_access = re.compile(r"(\b\w+)\.score_asmodeus\b")
    def repl_access(m: re.Match) -> str:
        nonlocal count
        count += 1
        obj = m.group(1)
        return f"({obj}.score_aurora ?? {obj}.score_asmodeus)"
    text = pat_access.sub(repl_access, text)
    # 2) optional chain x?.score_asmodeus → fallback
    pat_opt = re.compile(r"(\b\w+)\?\.score_asmodeus\b")
    def repl_opt(m: re.Match) -> str:
        nonlocal count
        count += 1
        obj = m.group(1)
        return f"({obj}?.score_aurora ?? {obj}?.score_asmodeus)"
    text = pat_opt.sub(repl_opt, text)
    # 3) string literal "score_asmodeus" em lista de campos → manter mas adicionar "score_aurora" antes
    # caso particular: gerarDossieOnDemandCallable.js
    if '"score_asmodeus"' in text and '"score_aurora"' not in text:
        text = text.replace('"score_asmodeus"', '"score_aurora",\n    "score_asmodeus"')
        count += 1
    return text, count


def rename_directory(old_dir: Path, new_dir: Path):
    if old_dir.exists() and not new_dir.exists():
        shutil.move(str(old_dir), str(new_dir))
        print(f"  RENAMED dir: {old_dir.relative_to(ROOT)} → {new_dir.relative_to(ROOT)}")


def fix_referenced_paths(text: str) -> tuple[str, int]:
    """Atualiza referências a /asmodeus/ e /assets/asmodeus/ em HTML/JS."""
    count = 0
    replacements = [
        ("/assets/asmodeus/sala.js", "/assets/sala-de-guerra/sala.js"),
        ("/assets/asmodeus/",        "/assets/sala-de-guerra/"),
        ("/public/asmodeus/",        "/public/sala-de-guerra/"),
        ("public/asmodeus/",         "public/sala-de-guerra/"),
        ("/asmodeus/index.html",     "/sala-de-guerra/index.html"),
        ("/asmodeus/",               "/sala-de-guerra/"),
    ]
    for old, new in replacements:
        if old in text:
            count += text.count(old)
            text = text.replace(old, new)
    return text, count


def process_file(path: Path) -> dict:
    try:
        original = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, IsADirectoryError):
        return {"skipped": True}
    text = original
    total = 0
    text, c1 = apply_replacements(text)
    total += c1
    text, c2 = handle_score_key_in_file(path, text)
    total += c2
    text, c3 = fix_referenced_paths(text)
    total += c3
    if text != original:
        path.write_text(text, encoding="utf-8")
        return {"changed": True, "subs": total, "ident": c1, "score_key": c2, "path_ref": c3}
    return {"changed": False, "subs": 0}


def main():
    print(f"[redact] root = {ROOT}\n")

    # 1) Rename diretórios
    print("=== STEP 1: Rename diretórios ===")
    rename_directory(ROOT / "frontend/public/asmodeus", ROOT / "frontend/public/sala-de-guerra")
    rename_directory(ROOT / "frontend/public/assets/asmodeus", ROOT / "frontend/public/assets/sala-de-guerra")
    print()

    # 2) Process files
    print("=== STEP 2: Substituições in-file ===")
    targets = scan_files([".js", ".jsx", ".ts", ".tsx", ".py", ".html", ".css", ".md", ".json", ".yaml", ".yml", ".sh"])
    changed = []
    for p in targets:
        res = process_file(p)
        if res.get("changed"):
            rel = p.relative_to(ROOT).as_posix()
            print(f"  {rel}: {res['subs']} subs (ident={res['ident']}, score_key={res['score_key']}, paths={res['path_ref']})")
            changed.append(rel)

    print(f"\n[redact] Total arquivos modificados: {len(changed)}")
    if changed:
        print("[redact] Arquivos alterados:")
        for f in changed:
            print(f"  - {f}")


if __name__ == "__main__":
    main()
