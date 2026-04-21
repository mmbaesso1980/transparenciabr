#!/usr/bin/env python3
"""
Pré-voo de deploy — verifica variáveis críticas no ambiente.
Executar na raiz ou com env carregado.
"""

from __future__ import annotations
import os
import sys
# --- ADICIONE ESTA LINHA ---
from dotenv import load_dotenv 

# --- ADICIONE ESTA LINHA PARA CARREGAR O ARQUIVO ---
load_dotenv() 

def _utf8_stdio() -> None:
    """Evita UnicodeEncodeError no Windows."""
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

def main() -> int:
    missing: list[str] = []

    # O script agora vai conseguir "ver" o que está no seu .env
    if not (os.environ.get("GEMINI_API_KEY") or "").strip():
        missing.append(
            "GEMINI_API_KEY (Google AI Studio — https://aistudio.google.com/apikey)"
        )

    if not (os.environ.get("STRIPE_SECRET_KEY") or "").strip():
        missing.append(
            "STRIPE_SECRET_KEY (Stripe Dashboard — https://dashboard.stripe.com/apikeys)"
        )

    proj = (
        os.environ.get("GCP_PROJECT_ID") or os.environ.get("GCP_PROJECT") or ""
    ).strip()
    if not proj:
        missing.append(
            "GCP_PROJECT_ID ou GCP_PROJECT (Google Cloud Console → projeto)"
        )

    uid = (
        os.environ.get("VITE_RADAR_ADMIN_UID")
        or os.environ.get("RADAR_OWNER_UID")
        or ""
    ).strip()
    if not uid:
        missing.append(
            "VITE_RADAR_ADMIN_UID ou RADAR_OWNER_UID (Firebase Console → Authentication → UID)"
        )

    if missing:
        print("❌ CHAVE FALTANDO — corrija antes do deploy:\n")
        for m in missing:
            print(f"  · {m}")
        return 1

    print("✅ MÁQUINA PRONTA — variáveis obrigatórias detectadas no ambiente.")
    return 0

if __name__ == "__main__":
    _utf8_stdio()
    sys.exit(main())