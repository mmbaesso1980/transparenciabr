#!/usr/bin/env bash
# ============================================================================
# EXECUTE_CURSOR.sh — Orquestrador do Roadmap v10.0.0 TransparênciaBR
# ----------------------------------------------------------------------------
# Comandante Baesso · 23 tasks · 6 sprints · 133 pts
# Uso:
#   ./EXECUTE_CURSOR.sh                       # menu interativo
#   ./EXECUTE_CURSOR.sh open M11              # abre spec M11 no Cursor
#   ./EXECUTE_CURSOR.sh sprint S0-EMERG       # abre todas as tasks do sprint
#   ./EXECUTE_CURSOR.sh next                  # abre próxima task pending do PROGRESS.md
#   ./EXECUTE_CURSOR.sh status                # mostra dashboard
#   ./EXECUTE_CURSOR.sh all                   # abre as 23 specs (cuidado)
# ============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROADMAP_DIR="$ROOT/docs/roadmap_v10"
PROGRESS="$ROADMAP_DIR/PROGRESS.md"
TASKS="$ROOT/CURSOR_TASKS.md"
PROMPT="$ROOT/prompts/CURSOR_PROMPT_MASTER.md"

# Detecta o binário do Cursor (Mac, Linux, WSL)
detect_cursor() {
  if command -v cursor >/dev/null 2>&1; then echo "cursor"; return; fi
  for p in \
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor" \
    "$HOME/.local/bin/cursor" \
    "/usr/local/bin/cursor" \
    "/snap/bin/cursor"; do
    [[ -x "$p" ]] && { echo "$p"; return; }
  done
  echo ""
}

CURSOR_BIN="$(detect_cursor)"

open_file() {
  local f="$1"
  if [[ -n "$CURSOR_BIN" ]]; then
    "$CURSOR_BIN" "$f" >/dev/null 2>&1 &
    echo "  ✓ aberto no Cursor: $(basename "$f")"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$f" >/dev/null 2>&1 &
    echo "  ✓ aberto (xdg): $(basename "$f")"
  elif command -v open >/dev/null 2>&1; then
    open "$f"
    echo "  ✓ aberto (macOS): $(basename "$f")"
  else
    echo "  ⚠ Cursor não encontrado. Caminho: $f"
  fi
}

cmd_open() {
  local id="$1"
  local f="$ROADMAP_DIR/${id}.md"
  [[ -f "$f" ]] || { echo "✗ Spec não existe: $id"; exit 1; }
  echo "▶ Abrindo $id"
  open_file "$f"
  open_file "$PROMPT"
}

cmd_sprint() {
  local sprint="$1"
  echo "▶ Sprint: $sprint"
  case "$sprint" in
    S0-EMERG|s0) IDS=(M11 M12 M01) ;;
    S1|s1)       IDS=(S03 S05 M02) ;;
    S2|s2)       IDS=(S01 S02 M09) ;;
    S3|s3)       IDS=(S04 S06 S07) ;;
    S4|s4)       IDS=(S08 S09 S11 M04) ;;
    S5|s5)       IDS=(S10 M03 M05 M06) ;;
    S6|s6)       IDS=(M07 M08 M10) ;;
    *) echo "Sprint inválido. Opções: S0-EMERG S1 S2 S3 S4 S5 S6"; exit 1 ;;
  esac
  for id in "${IDS[@]}"; do
    open_file "$ROADMAP_DIR/${id}.md"
  done
  open_file "$PROMPT"
  open_file "$TASKS"
}

cmd_next() {
  # Lê PROGRESS.md e abre a primeira task com status [ ]
  local next_id
  next_id="$(grep -E '^\| \[ \]' "$PROGRESS" | head -1 | awk -F'|' '{print $3}' | tr -d ' ' || true)"
  [[ -z "$next_id" ]] && { echo "✓ Todas as tasks marcadas como concluídas no PROGRESS.md"; exit 0; }
  echo "▶ Próxima task pendente: $next_id"
  cmd_open "$next_id"
}

cmd_status() {
  echo "================================================================"
  echo "  ROADMAP v10.0.0 — TransparênciaBR · Comandante Baesso"
  echo "================================================================"
  local total done_count pending
  total=$(grep -cE '^\| \[' "$PROGRESS" || echo 0)
  done_count=$(grep -cE '^\| \[x\]' "$PROGRESS" || echo 0)
  pending=$((total - done_count))
  echo "  Tasks totais:   $total"
  echo "  Concluídas:     $done_count"
  echo "  Pendentes:      $pending"
  echo ""
  echo "  Cursor binary:  ${CURSOR_BIN:-NÃO ENCONTRADO}"
  echo "  Roadmap dir:    $ROADMAP_DIR"
  echo "================================================================"
  echo ""
  echo "  Próximas 5 tasks pendentes:"
  grep -E '^\| \[ \]' "$PROGRESS" | head -5 | awk -F'|' '{printf "    %s  %s\n", $3, $4}'
}

cmd_all() {
  read -rp "Vai abrir 23 arquivos + prompt + tasks. Confirma? [y/N] " ans
  [[ "$ans" =~ ^[yY] ]] || { echo "Cancelado."; exit 0; }
  for f in "$ROADMAP_DIR"/*.md; do open_file "$f"; done
  open_file "$PROMPT"
  open_file "$TASKS"
}

cmd_menu() {
  echo ""
  echo "  ┌──────────────────────────────────────────────────┐"
  echo "  │  ROADMAP v10.0.0 — TransparênciaBR               │"
  echo "  │  23 tasks · 6 sprints · 133 pts                  │"
  echo "  └──────────────────────────────────────────────────┘"
  echo ""
  echo "  1) Status do roadmap"
  echo "  2) Abrir próxima task pendente"
  echo "  3) Abrir sprint S0-EMERG (M11 + M12 + M01)  ← INÍCIO"
  echo "  4) Abrir sprint específico (S1..S6)"
  echo "  5) Abrir task específica (ID)"
  echo "  6) Abrir TODAS as 23 specs"
  echo "  7) Abrir prompt-mãe + CURSOR_TASKS.md"
  echo "  0) Sair"
  echo ""
  read -rp "  Opção: " opt
  case "$opt" in
    1) cmd_status ;;
    2) cmd_next ;;
    3) cmd_sprint S0-EMERG ;;
    4) read -rp "  Sprint (S1..S6): " s; cmd_sprint "$s" ;;
    5) read -rp "  ID (ex: M11): " i; cmd_open "$i" ;;
    6) cmd_all ;;
    7) open_file "$PROMPT"; open_file "$TASKS" ;;
    0) exit 0 ;;
    *) echo "  Opção inválida." ;;
  esac
}

# ─── Dispatcher ─────────────────────────────────────────────────────────────
case "${1:-menu}" in
  open)    shift; cmd_open "$@" ;;
  sprint)  shift; cmd_sprint "$@" ;;
  next)    cmd_next ;;
  status)  cmd_status ;;
  all)     cmd_all ;;
  menu)    cmd_menu ;;
  *)       echo "Uso: $0 [menu|status|next|open <ID>|sprint <S0-EMERG..S6>|all]"; exit 1 ;;
esac
