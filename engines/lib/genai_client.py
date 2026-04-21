"""Validação da API Key Gemini (homologação) — SDK google-genai."""

from __future__ import annotations

import os


def require_gemini_api_key() -> str:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        raise RuntimeError(
            "Defina GEMINI_API_KEY no ambiente (homologação via API Key até Vertex/IAM)."
        )
    return api_key
