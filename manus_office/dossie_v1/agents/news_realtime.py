"""
Agente news_realtime — 11º agente do Dossiê Forense v1.0 (ADDON, fora da Legião 100).

Coleta notícias recentes sobre o parlamentar via:
- Google News RSS
- GDELT 2.0 DOC API
- Google Dorks em veículos jornalísticos brasileiros

Classifica relevância forense via Gemini Flash (0-3) e devolve findings tipo NEWS-XX.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any

USER_AGENT = "Mozilla/5.0 (compatible; TransparenciaBR-NewsRT/1.0; +https://transparenciabr.org/bot)"
HTTP_TIMEOUT = float(os.environ.get("NEWS_HTTP_TIMEOUT", "15"))

DORK_DOMAINS = (
    "cnnbrasil.com.br",
    "folha.uol.com.br",
    "g1.globo.com",
    "uol.com.br",
    "oglobo.globo.com",
    "poder360.com.br",
)


# =============================================================================
# HTTP helper
# =============================================================================


def _http_get(url: str, timeout: float = HTTP_TIMEOUT) -> str | None:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "pt-BR"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            charset = resp.headers.get_content_charset() or "utf-8"
            try:
                return data.decode(charset, errors="replace")
            except LookupError:
                return data.decode("utf-8", errors="replace")
    except Exception:
        return None


# =============================================================================
# Google News RSS
# =============================================================================


def _google_news_rss(nome: str) -> list[dict[str, Any]]:
    q = urllib.parse.quote(nome)
    url = f"https://news.google.com/rss/search?q={q}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
    body = _http_get(url)
    if not body:
        return []
    items: list[dict[str, Any]] = []
    try:
        root = ET.fromstring(body)
        for item in root.iter("item"):
            title = (item.findtext("title") or "").strip()
            link = (item.findtext("link") or "").strip()
            pub = (item.findtext("pubDate") or "").strip()
            desc = (item.findtext("description") or "").strip()
            desc = re.sub(r"<[^>]+>", "", desc)[:500]
            source_el = item.find("{http://news.google.com/}source") or item.find("source")
            source = (source_el.text if source_el is not None and source_el.text else "")
            items.append(
                {
                    "titulo": title,
                    "url": link,
                    "snippet": desc,
                    "data_publicacao": pub,
                    "fonte_origem": source,
                    "origem_coleta": "google_news_rss",
                }
            )
    except ET.ParseError:
        return []
    return items


# =============================================================================
# GDELT 2.0 DOC API
# =============================================================================


def _gdelt(nome: str, max_records: int = 50) -> list[dict[str, Any]]:
    q = urllib.parse.quote(f"{nome} sourcecountry:BR")
    url = (
        f"https://api.gdeltproject.org/api/v2/doc/doc?query={q}"
        f"&mode=ArtList&format=json&maxrecords={max_records}&sort=DateDesc"
    )
    body = _http_get(url)
    if not body:
        return []
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return []
    out: list[dict[str, Any]] = []
    for art in data.get("articles", []) or []:
        out.append(
            {
                "titulo": (art.get("title") or "").strip(),
                "url": (art.get("url") or "").strip(),
                "snippet": (art.get("seendate") or "") + " · " + (art.get("domain") or ""),
                "data_publicacao": art.get("seendate") or "",
                "fonte_origem": art.get("domain") or "",
                "origem_coleta": "gdelt_2_0",
            }
        )
    return out


# =============================================================================
# Dorks via DuckDuckGo
# =============================================================================


def _ddg_dork(query: str, max_results: int = 8) -> list[dict[str, Any]]:
    try:
        from ddgs import DDGS  # type: ignore
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except ImportError:
            return []
    out: list[dict[str, Any]] = []
    try:
        with DDGS() as ddg:
            for h in ddg.text(query, max_results=max_results, region="br-pt"):
                out.append(
                    {
                        "titulo": h.get("title") or h.get("heading") or "",
                        "url": h.get("href") or h.get("url") or "",
                        "snippet": (h.get("body") or h.get("snippet") or "")[:500],
                        "data_publicacao": "",
                        "fonte_origem": "duckduckgo_dork",
                        "origem_coleta": f"dork:{query[:60]}",
                    }
                )
    except Exception:
        return []
    return out


# =============================================================================
# Gemini Flash classifier
# =============================================================================


def _classificar_relevancia(noticia: dict[str, Any], nome: str) -> tuple[int, str]:
    """Retorna (score 0-3, fato em 1 linha). Score >= 2 entra no dossiê."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError:
        return 0, ""

    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not key:
        return 0, ""

    model = (os.environ.get("MANUS_GEMINI_FLASH_MODEL") or "gemini-2.5-flash").strip()
    try:
        llm = ChatGoogleGenerativeAI(model=model, temperature=0.1, google_api_key=key)
    except Exception:
        return 0, ""

    prompt = f"""Você está triando notícias para um dossiê forense parlamentar (tom INFORMATIVO).

Parlamentar: {nome}
Título: {noticia.get('titulo', '')}
Snippet: {noticia.get('snippet', '')}
URL: {noticia.get('url', '')}
Fonte: {noticia.get('fonte_origem', '')}

Tarefa:
1. Classifique a relevância forense de 0 a 3:
   - 0 = irrelevante (esporte, fofoca, homônimo)
   - 1 = contextual (declaração política trivial)
   - 2 = relevante (processo, gasto público, controvérsia institucional)
   - 3 = altamente relevante (decisão judicial, investigação, anomalia financeira)
2. Extraia o FATO em UMA linha começando com verbo descritivo ("registra", "consta", "observa-se"). PROIBIDO usar: fraudou, desviou, roubou, corrupto.

Responda APENAS JSON: {{"score": <0-3>, "fato": "<linha>"}}
"""
    try:
        resp = llm.invoke(prompt)
        text = (getattr(resp, "content", None) or str(resp)).strip()
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r"\s*```\s*$", "", text)
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            return 0, ""
        data = json.loads(text[start : end + 1])
        score = int(data.get("score", 0))
        fato = str(data.get("fato", "")).strip()
        return max(0, min(3, score)), fato
    except Exception:
        return 0, ""


# =============================================================================
# API pública
# =============================================================================


def coletar_noticias_atuais(nome_parlamentar: str, dias: int = 30) -> list[dict[str, Any]]:
    """
    Coleta notícias dos últimos `dias` sobre o parlamentar, classifica via Gemini Flash
    e retorna findings tipo NEWS-XX com score >= 2.

    Nota: `dias` é informativo (Google News RSS já prioriza recentes; GDELT também).
    """
    print(f"[news_realtime] coletando para '{nome_parlamentar}' (janela {dias}d)…", file=sys.stderr)
    candidatos: list[dict[str, Any]] = []

    # 1. Google News RSS.
    candidatos.extend(_google_news_rss(nome_parlamentar))
    # 2. GDELT.
    candidatos.extend(_gdelt(nome_parlamentar))
    # 3. Dorks.
    for dom in DORK_DOMAINS:
        candidatos.extend(_ddg_dork(f'site:{dom} "{nome_parlamentar}"', max_results=5))
        time.sleep(0.4)

    # Dedup por URL.
    seen = set()
    unicos: list[dict[str, Any]] = []
    for c in candidatos:
        u = c.get("url") or ""
        if not u or u in seen:
            continue
        seen.add(u)
        unicos.append(c)

    print(f"[news_realtime] {len(unicos)} candidatos únicos; classificando…", file=sys.stderr)

    # 4. Classifica e filtra score >= 2.
    findings: list[dict[str, Any]] = []
    for i, c in enumerate(unicos[:40]):  # limite de segurança 40 chamadas Gemini Flash
        score, fato = _classificar_relevancia(c, nome_parlamentar)
        if score < 2:
            continue
        findings.append(
            {
                "id": f"NEWS-{len(findings) + 1:02d}",
                "titulo": c.get("titulo", "")[:200],
                "fato": fato or c.get("snippet", "")[:300],
                "url": c.get("url", ""),
                "link": c.get("url", ""),
                "data_publicacao": c.get("data_publicacao", ""),
                "fonte_origem": c.get("fonte_origem", ""),
                "origem_coleta": c.get("origem_coleta", ""),
                "score_relevancia": score,
                "coletado_em": datetime.utcnow().isoformat() + "Z",
            }
        )

    print(f"[news_realtime] {len(findings)} findings NEWS-* finais (score>=2)", file=sys.stderr)
    return findings


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--nome", required=True)
    ap.add_argument("--dias", type=int, default=30)
    args = ap.parse_args()
    result = coletar_noticias_atuais(args.nome, args.dias)
    print(json.dumps(result, ensure_ascii=False, indent=2))
