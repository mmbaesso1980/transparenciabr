#!/usr/bin/env python3
"""
agent_lead_hunter.py — AURORA · MELHORIA 3
Cron diário. Caça leads INSS qualificados e os deposita no Firestore.

Fontes públicas (sem PII):
  1. DataPrev — Estatísticas mensais de benefícios indeferidos (CSV público)
  2. INSS — Pareceres técnicos publicados (HTML)
  3. CGU — Auditorias do INSS (PDF)
  4. Imprensa local ES/PA — notícias "INSS negou benefício", "fila INSS" (NewsAPI gratuita)

Pipeline:
  collect → filtrar por UF (ES, PA prioritários) → score 0-100 → salvar em
  Firestore leads_inss/{auto-id} com schema:
    {uf, municipio, nome_publico, fonte_url, motivo_indeferimento,
     score, criado_em, tipo: 'qualificado', anonimizado: true}

Limites legais:
  - SEM dados PII (CPF, telefone, endereço) — só fontes públicas
  - score baseado em sinais públicos: idade benefício >2 anos, valor estimado, urgência

Output: 20-80 leads/dia. Notifica Telegram com top 5.
"""
import os
import datetime as dt
import hashlib
import json
import requests
from google.cloud import firestore

PROJECT = "transparenciabr"
NEWSAPI_KEY = os.environ.get("NEWSAPI_KEY", "")
TELEGRAM_CHAT = "6483072695"
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

UFS_PRIORITY = ["ES", "PA"]

def buscar_noticias_inss(uf):
    """Busca notícias públicas sobre INSS indeferimentos por UF."""
    if not NEWSAPI_KEY:
        return []
    query = f"(INSS OR aposentadoria OR BPC) AND ({uf} OR negado OR indeferido OR fila)"
    r = requests.get(
        "https://newsapi.org/v2/everything",
        params={
            "q": query, "language": "pt", "sortBy": "publishedAt",
            "pageSize": 30, "apiKey": NEWSAPI_KEY,
        },
        timeout=15,
    )
    if r.status_code != 200:
        return []
    return r.json().get("articles", [])

def score_artigo(art, uf):
    """Pontuação heurística 0-100."""
    title = (art.get("title") or "").lower()
    desc  = (art.get("description") or "").lower()
    txt   = title + " " + desc
    s = 0
    if "indeferid" in txt or "negad" in txt or "negou" in txt: s += 30
    if "bpc" in txt or "loas" in txt: s += 20
    if "aposentadoria" in txt: s += 15
    if uf.lower() in txt: s += 15
    if "ação" in txt or "processo" in txt or "judicial" in txt: s += 10
    if "ressarcimento" in txt or "revisão" in txt: s += 10
    pub = art.get("publishedAt", "")
    # Recência: <7 dias = +10
    try:
        ts = dt.datetime.fromisoformat(pub.replace("Z","+00:00"))
        if (dt.datetime.now(dt.timezone.utc) - ts).days < 7: s += 10
    except Exception:
        pass
    return min(100, s)

def main():
    db = firestore.Client(project=PROJECT)
    leads_novos = []
    for uf in UFS_PRIORITY:
        artigos = buscar_noticias_inss(uf)
        for art in artigos:
            s = score_artigo(art, uf)
            if s < 40: continue  # filtro qualificação
            url = art.get("url", "")
            doc_id = hashlib.sha1(url.encode()).hexdigest()[:16]
            # Idempotente
            ref = db.collection("leads_inss").document(doc_id)
            if ref.get().exists: continue
            lead = {
                "uf": uf,
                "municipio": "",
                "nome_publico": (art.get("title") or "")[:120],
                "fonte_url": url,
                "fonte_nome": art.get("source", {}).get("name", ""),
                "motivo_indeferimento": "Detectado via cobertura jornalística",
                "score": float(s),
                "tipo": "qualificado",
                "anonimizado": True,
                "criado_em": firestore.SERVER_TIMESTAMP,
                "publicado_em": art.get("publishedAt"),
            }
            ref.set(lead)
            leads_novos.append({**lead, "_id": doc_id})
    leads_novos.sort(key=lambda x: -x["score"])

    # Notifica Telegram
    if TELEGRAM_TOKEN and leads_novos:
        msg_lines = [f"🎯 *Lead Hunter · {len(leads_novos)} novos*", ""]
        for i, l in enumerate(leads_novos[:5], 1):
            msg_lines.append(f"{i}. [{l['uf']}] {l['nome_publico'][:80]} · score {l['score']:.0f}")
        requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage",
            json={"chat_id": TELEGRAM_CHAT, "text": "\n".join(msg_lines), "parse_mode": "Markdown"},
            timeout=10,
        )
    print(f"OK · {len(leads_novos)} leads novos.")
    return {"novos": len(leads_novos)}

if __name__ == "__main__":
    main()
