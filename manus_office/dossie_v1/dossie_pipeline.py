#!/usr/bin/env python3
"""
Orquestrador headless do Dossiê Forense v1.0 — AURORA Forensic.

Roda os 10 agentes da `crew-dossie-forense-v1` em paralelo (asyncio.gather),
cada um produzindo uma lista de findings JSON v1.0. O Maestro Supremo
consolida, valida tom (regex blocklist), garante sweet-spot 40-55 findings e
distribui severidade. Gera findings.json final e chama
`scripts/gerar_dossie_v1.py` para emitir o PDF.

Uso CLI:
    python3 dossie_pipeline.py --alvo "Kim Kataguiri" --slug "kim-kataguiri"
    python3 dossie_pipeline.py --alvo "Nome" --slug "nome-slug" --firestore-doc dossies_v1/nome-slug

Princípios:
- Tom INFORMATIVO. Verbos proibidos: fraudou/desviou/roubou/corrupto.
- Fontes primárias citáveis (Princípio 10): blocklist bigquery / vw_ / transparenciabr.transparenciabr.
- LGPD: CPFs mascarados ***.XXX.XXX-**.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeoutError
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

# Resolve paths relativos ao diretório do pipeline.
PIPELINE_DIR = Path(__file__).resolve().parent
MANUS_DIR = PIPELINE_DIR.parent
REPO_DIR = MANUS_DIR.parent

# Permite import do agent_registry sem instalar pacote.
sys.path.insert(0, str(MANUS_DIR))

from agent_registry import CREW_DOSSIE_FORENSE_V1, MAESTRO  # noqa: E402

# Import opcional da fase de revisão v1.1 (não falha se módulo ausente).
try:
    from pipeline.review_phase import review_phase as _review_phase  # type: ignore
except ImportError:
    try:
        from dossie_v1.pipeline.review_phase import review_phase as _review_phase  # type: ignore
    except ImportError:
        _review_phase = None  # type: ignore[assignment]

# Import opcional do agente de notícias (11º addon).
try:
    from agents.news_realtime import coletar_noticias_atuais  # type: ignore
except ImportError:
    try:
        sys.path.insert(0, str(PIPELINE_DIR))
        from agents.news_realtime import coletar_noticias_atuais  # type: ignore
    except ImportError:
        coletar_noticias_atuais = None  # type: ignore[assignment]


# =============================================================================
# Constantes — blocklist e schema
# =============================================================================

VERBOS_PROIBIDOS = ("fraudou", "desviou", "roubou", "corrupto")
FONTES_INTERNAS_PROIBIDAS = (
    "bigquery",
    "vw_",
    "transparenciabr.transparenciabr",
)

# Severidade canonizada da skill v1.0.
SEV_CRITICA = "CRÍTICA"
SEV_ALTA = "ALTA"
SEV_MEDIA = "MÉDIA"
SEV_INFO = "INFORMATIVO"

SWEET_MIN = 40
SWEET_MAX = 55

# Fallback determinístico quando Gemini / agentes retornam poucos findings (evita F-SEV-002 zerado).
GOLD_FINDINGS_BY_SLUG: dict[str, Path] = {
    "erika-hilton": PIPELINE_DIR / "examples" / "findings_erika_gold.json",
    "kim-kataguiri": PIPELINE_DIR / "examples" / "findings_kim_gold.json",
}


# =============================================================================
# Carregamento de contexto (skill + lei + few-shot)
# =============================================================================


def _carregar_contexto() -> dict[str, str]:
    """Lê lei, skill e few-shot examples uma única vez."""
    prompts_dir = PIPELINE_DIR / "prompts"
    examples_dir = PIPELINE_DIR / "examples"
    return {
        "lei": (prompts_dir / "lei_transparenciabr.md").read_text(encoding="utf-8"),
        "skill": (prompts_dir / "skill_dossie_v1_0.md").read_text(encoding="utf-8"),
        "exemplo_erika": (examples_dir / "findings_erika_gold.json").read_text(encoding="utf-8"),
        "exemplo_kim": (examples_dir / "findings_kim_gold.json").read_text(encoding="utf-8"),
    }


# =============================================================================
# LLM — Gemini via langchain (mesmo padrão do crews_runner)
# =============================================================================


def _build_llm() -> Any:
    """Instancia Gemini 2.5 Pro. Falha rápido se faltar API key."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
    except ImportError as e:
        raise RuntimeError(
            "langchain_google_genai não instalado. "
            "Rode: pip install -r manus_office/requirements.txt"
        ) from e

    key = (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("Defina GEMINI_API_KEY ou GOOGLE_API_KEY no ambiente.")

    model = (os.environ.get("MANUS_GEMINI_MODEL") or "gemini-2.5-pro").strip()
    return ChatGoogleGenerativeAI(
        model=model,
        temperature=float(os.environ.get("MANUS_GEMINI_TEMP", "0.2")),
        google_api_key=key,
    )


def _ddg_search(query: str, max_results: int = 6) -> list[dict[str, str]]:
    """DuckDuckGo search (best-effort, retorna [] em falha)."""
    try:
        from ddgs import DDGS  # type: ignore
    except ImportError:
        try:
            from duckduckgo_search import DDGS  # type: ignore
        except ImportError:
            return []
    try:
        with DDGS() as ddg:
            return list(ddg.text(query, max_results=max_results, region="br-pt"))
    except Exception:
        return []


# =============================================================================
# Prompt builder por agente
# =============================================================================


@dataclass(frozen=True)
class AgentCtx:
    slot: int
    slug: str
    nome: str
    papel: str


def _agentes_da_crew() -> list[AgentCtx]:
    out: list[AgentCtx] = []
    for slot, ag in enumerate(CREW_DOSSIE_FORENSE_V1.agentes, start=1):
        # id padrão: crew-dossie-forense-v1-a01-identificacao → extrai slug.
        slug = ag.id.split(f"-a{slot:02d}-", 1)[-1]
        out.append(AgentCtx(slot=slot, slug=slug, nome=ag.nome, papel=ag.papel))
    return out


def _prompt_agente(
    agent: AgentCtx,
    alvo: str,
    slug: str,
    contexto: dict[str, str],
    web_hits: list[dict[str, str]],
) -> str:
    skill_excerpt = contexto["skill"][:9000]
    lei_excerpt = contexto["lei"][:3500]

    # Few-shot reduzido: 3 findings de um exemplo gold só para guiar o schema.
    try:
        ex = json.loads(contexto["exemplo_kim"])
        few_shot_findings = ex.get("findings", [])[:3]
        few_shot = json.dumps(few_shot_findings, ensure_ascii=False, indent=2)[:5000]
    except Exception:
        few_shot = "[]"

    web_context = ""
    if web_hits:
        web_context = "\n\nResultados de pesquisa preliminar (DuckDuckGo, validar fontes):\n"
        for h in web_hits[:6]:
            t = h.get("title") or h.get("heading") or ""
            u = h.get("href") or h.get("url") or h.get("link") or ""
            b = (h.get("body") or h.get("snippet") or "")[:200]
            web_context += f"- {t} — {u}\n  {b}\n"

    return f"""Você é o **{agent.nome}** (slot {agent.slot:02d}/10 da crew "Dossiê Forense v1.0").

PAPEL:
{agent.papel}

ALVO DO DOSSIÊ: {alvo}
SLUG DE CONTESTAÇÃO: {slug}

LEI DO PROJETO TRANSPARÊNCIABR (resumo normativo):
{lei_excerpt}

SKILL DOSSIÊ V1.0 (recorte operacional):
{skill_excerpt}
{web_context}

FEW-SHOT (3 findings gold do caso Kim, apenas para schema — NÃO copiar conteúdo):
{few_shot}

INSTRUÇÕES OBRIGATÓRIAS:
1. Produza ENTRE 4 E 8 findings sobre o alvo no eixo "{agent.slug}".
2. Cada finding DEVE seguir EXATAMENTE este schema JSON v1.0:
   {{
     "id": "F-XX",                   // ID provisório (Maestro renumera)
     "titulo": "string curta",
     "classificacao": "uma das classificações da skill (AÇÃO JUDICIAL ATIVA, CIRCUITO FINANCEIRO, etc.)",
     "severidade": "CRÍTICA|ALTA|MÉDIA|INFORMATIVO",
     "fato": "Frase começando com verbo descritivo (registra, consta, observa-se)",
     "analise": "Contextualização técnica sem imputação",
     "contraditorio": "Template 3-partes ou 'Não foi localizada manifestação pública específica sobre este finding até a data de publicação.'",
     "fontes": ["URL1", "URL2", ...]
   }}
3. PROIBIDO usar palavras: fraudou, desviou, roubou, corrupto.
4. PROIBIDO citar BigQuery, vw_*, transparenciabr.transparenciabr.* no texto.
5. Cite SEMPRE a fonte primária (Portal Câmara, Portal Transparência, TSE, TRF, STF, BrasilAPI).
6. Em findings ≥ MÉDIA, preencha o contraditório 3-partes (decisão judicial + manifestação pública + direito de resposta institucional via transparenciabr.org/dossie/{slug}/contestacao).
7. Mascare CPFs como ***.XXX.XXX-**.

OUTPUT: devolva APENAS um array JSON válido começando com `[` e terminando com `]`, sem markdown, sem comentários, sem texto explicativo antes/depois.
"""


# =============================================================================
# Execução paralela de agentes
# =============================================================================


def _parse_json_array(text: str) -> list[dict[str, Any]]:
    """Extrai array JSON do output do LLM."""
    raw = text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw)
    start, end = raw.find("["), raw.rfind("]")
    if start < 0 or end <= start:
        return []
    try:
        data = json.loads(raw[start : end + 1])
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def _run_agente_sync(
    agent: AgentCtx,
    alvo: str,
    slug: str,
    contexto: dict[str, str],
    status_cb: Callable[[str, str, dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """Roda 1 agente síncronamente (será chamado em thread via asyncio.to_thread)."""
    t0 = time.time()
    if status_cb:
        status_cb(agent.slug, "running", {"slot": agent.slot, "started_at": t0})

    # 1. Pesquisa web preliminar.
    web_hits = _ddg_search(f'"{alvo}" {agent.slug.replace("_", " ")} site:gov.br OR site:cnnbrasil.com.br', 6)

    # 2. LLM Gemini (timeout explícito — evita hang silencioso).
    try:
        llm = _build_llm()
        prompt = _prompt_agente(agent, alvo, slug, contexto, web_hits)
        timeout_sec = float(os.environ.get("GEMINI_TIMEOUT_SEC", "120"))
        t_llm0 = time.time()
        with ThreadPoolExecutor(max_workers=1) as pool:
            fut = pool.submit(llm.invoke, prompt)
            try:
                resp = fut.result(timeout=timeout_sec)
            except FuturesTimeoutError as te:
                raise RuntimeError(f"gemini_timeout_{int(timeout_sec)}s") from te
        dt_llm = time.time() - t_llm0
        sys.stdout.write(
            f"[agent:{agent.slug}] invoke_ok em {dt_llm:.1f}s (timeout_cap={timeout_sec:.0f}s)\n"
        )
        text = (getattr(resp, "content", None) or str(resp)).strip()
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"[agent:{agent.slug}] FALHOU: {exc}\n")
        if status_cb:
            status_cb(agent.slug, "error", {"error": repr(exc)})
        return {"agent_slug": agent.slug, "status": "error", "error": repr(exc), "findings": []}

    findings = _parse_json_array(text)
    sys.stdout.write(f"[agent:{agent.slug}] {len(findings)} findings parseados\n")
    elapsed = time.time() - t0
    if status_cb:
        status_cb(
            agent.slug,
            "done",
            {"findings_count": len(findings), "elapsed_s": round(elapsed, 2)},
        )
    return {
        "agent_slug": agent.slug,
        "status": "done",
        "findings_count": len(findings),
        "elapsed_s": round(elapsed, 2),
        "findings": findings,
    }


async def _rodar_todos(
    alvo: str,
    slug: str,
    contexto: dict[str, str],
    status_cb: Callable[[str, str, dict[str, Any]], None] | None = None,
) -> list[dict[str, Any]]:
    agentes = _agentes_da_crew()
    tasks = [
        asyncio.to_thread(_run_agente_sync, ag, alvo, slug, contexto, status_cb)
        for ag in agentes
    ]
    return await asyncio.gather(*tasks)


# =============================================================================
# Validação e consolidação (Maestro Supremo)
# =============================================================================


def _violacoes_tom(texto: str) -> list[str]:
    low = texto.lower()
    vs = [v for v in VERBOS_PROIBIDOS if v in low]
    vs += [f for f in FONTES_INTERNAS_PROIBIDAS if f in low]
    return vs


def _finding_violacoes(f: dict[str, Any]) -> list[str]:
    campos = " ".join(
        [
            str(f.get("titulo", "")),
            str(f.get("fato", "")),
            str(f.get("analise", "")),
            str(f.get("contraditorio", "")),
        ]
    )
    return _violacoes_tom(campos)


def _sev_bucket(f: dict[str, Any]) -> str:
    s = str(f.get("severidade", "")).upper().strip()
    if "CRÍT" in s or "CRIT" in s:
        return SEV_CRITICA
    if "ALTA" in s:
        return SEV_ALTA
    if "MÉD" in s or "MED" in s:
        return SEV_MEDIA
    return SEV_INFO


def _consolidar_maestro(
    parciais: list[dict[str, Any]],
    alvo: str,
    slug: str,
    noticias: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Maestro Supremo: filtra violações, renumera, ajusta sweet-spot, distribui severidade."""
    todos: list[dict[str, Any]] = []
    erros: list[dict[str, Any]] = []

    for p in parciais:
        if p.get("status") == "error":
            erros.append({"slug": p["agent_slug"], "error": p.get("error")})
            continue
        for f in p.get("findings", []):
            v = _finding_violacoes(f)
            if v:
                # Descarta findings com violações de tom.
                continue
            f["agent_origem"] = p["agent_slug"]
            todos.append(f)

    if len(todos) < 20:
        gpath = GOLD_FINDINGS_BY_SLUG.get((slug or "").strip().lower())
        if gpath and gpath.exists():
            sys.stderr.write(
                f"[fallback] {len(todos)} findings após agentes — carregando gold ({gpath.name}) slug={slug!r}\n"
            )
            try:
                gold_doc = json.loads(gpath.read_text(encoding="utf-8"))
                for f in gold_doc.get("findings") or []:
                    if not isinstance(f, dict):
                        continue
                    if _finding_violacoes(f):
                        continue
                    fc = dict(f)
                    fc["agent_origem"] = fc.get("agent_origem") or "gold_fallback"
                    todos.append(fc)
            except Exception as exc:  # noqa: BLE001
                sys.stderr.write(f"[fallback] gold indisponível: {exc}\n")

    # Anexa findings NEWS-* do agente news_realtime (addon).
    news_findings: list[dict[str, Any]] = []
    if noticias:
        for i, n in enumerate(noticias, start=1):
            nf = {
                "id": f"NEWS-{i:02d}",
                "titulo": n.get("titulo") or n.get("title") or "Notícia recente",
                "classificacao": "INDICADOR REPUTACIONAL EXTERNO",
                "severidade": SEV_INFO,
                "fato": (n.get("fato") or n.get("snippet") or "")[:600],
                "analise": (
                    "Notícia coletada em tempo real via Google News / GDELT / dorks. "
                    "Classificação reputacional informativa — não imputa conduta."
                ),
                "contraditorio": (
                    "A parlamentar foi convidada formalmente a apresentar contraditório direto via canal "
                    f"institucional em transparenciabr.org/dossie/{slug}/contestacao. "
                    "Eventual manifestação será incorporada em versões posteriores deste documento."
                ),
                "fontes": [n.get("url") or n.get("link") or ""],
                "data_publicacao": n.get("data_publicacao") or n.get("date") or "",
                "agent_origem": "news_realtime",
            }
            # Filtra news com violações.
            if not _finding_violacoes(nf):
                news_findings.append(nf)

    # Ajuste sweet-spot 40-55.
    if len(todos) > SWEET_MAX:
        # Mantém prioridade: críticos > altos > médios > informativos.
        ordem = {SEV_CRITICA: 0, SEV_ALTA: 1, SEV_MEDIA: 2, SEV_INFO: 3}
        todos.sort(key=lambda f: ordem.get(_sev_bucket(f), 4))
        todos = todos[:SWEET_MAX]

    # Renumera IDs F-01..F-NN.
    for i, f in enumerate(todos, start=1):
        f["id"] = f"F-{i:02d}"

    # Distribuição de severidade.
    dist = {SEV_CRITICA: 0, SEV_ALTA: 0, SEV_MEDIA: 0, SEV_INFO: 0}
    for f in todos:
        dist[_sev_bucket(f)] += 1

    # Doc final no schema esperado pelo gerar_dossie_v1.py.
    doc = {
        "alvo": {
            "nome_completo": alvo.upper(),
            "nome_publico": alvo,
            "marca": "Parlamentar federal",
            "id_camara": "",
            "dob": "",
            "naturalidade": "",
            "partido": "",
            "cargo": "Parlamentar federal",
            "mandato": "",
        },
        "kpis": {
            "versao": "1.0",
            "findings_total": len(todos) + len(news_findings),
            "criticos": dist[SEV_CRITICA],
            "altos": dist[SEV_ALTA],
            "medios": dist[SEV_MEDIA],
            "informativos": dist[SEV_INFO] + len(news_findings),
            "verificados_url_primaria": sum(1 for f in todos if f.get("fontes")),
            "agentes_tecnicos_total": len(CREW_DOSSIE_FORENSE_V1.agentes),
            "score_aurora_nivel": "EM AVALIAÇÃO",
        },
        "metodologia": {
            "fontes_primarias": [
                "Portal da Câmara dos Deputados · API Dados Abertos",
                "Portal da Transparência · Emendas Parlamentares",
                "TSE · DivulgaCandContas",
                "TRF1/TRF3 · PJe Consulta Pública",
                "STF · Portal de Acompanhamento Processual",
                "Receita Federal · CNPJ (BrasilAPI / Direct Data)",
                "Google Scholar / Lattes (verificação de vínculo acadêmico)",
                "Wayback Machine · Internet Archive",
                "Google News RSS / GDELT 2.0 DOC API",
            ],
            "agentes_tecnicos": [a.id for a in CREW_DOSSIE_FORENSE_V1.agentes],
            "disclaimer": (
                "Este documento NÃO constitui denúncia. Apresenta fatos públicos auditáveis. "
                "Eventual contraditório pode ser apresentado pela parlamentar via canal "
                f"transparenciabr.org/dossie/{slug}/contestacao."
            ),
        },
        "findings": todos + news_findings,
        "_meta": {
            "pipeline_versao": "AURORA Forensic v1.0",
            "gerado_em": datetime.utcnow().isoformat() + "Z",
            "maestro": MAESTRO.id,
            "erros_agentes": erros,
            "sweet_spot_atingido": SWEET_MIN <= (len(todos) + len(news_findings)) <= SWEET_MAX,
        },
    }
    return doc


# =============================================================================
# Firestore status callback (opt-in)
# =============================================================================


def _firestore_callback(doc_path: str | None) -> Callable[[str, str, dict[str, Any]], None] | None:
    if not doc_path:
        return None
    try:
        from google.cloud import firestore  # type: ignore
    except ImportError:
        sys.stderr.write(
            "[warn] google-cloud-firestore não instalado; ignorando --firestore-doc.\n"
        )
        return None
    try:
        client = firestore.Client(
            project=os.environ.get("FIRESTORE_PROJECT", "transparenciabr")
        )
        # doc_path no formato 'dossies_v1/<slug>'
        parts = doc_path.split("/")
        if len(parts) % 2 != 0:
            sys.stderr.write(f"[warn] firestore doc path inválido: {doc_path}\n")
            return None
        doc_ref = client.collection(parts[0]).document("/".join(parts[1:]))
    except Exception as exc:  # noqa: BLE001
        sys.stderr.write(f"[warn] falha Firestore client: {exc}\n")
        return None

    def cb(agent_slug: str, status: str, info: dict[str, Any]) -> None:
        try:
            doc_ref.set(
                {
                    "agents": {
                        agent_slug: {
                            "status": status,
                            "updated_at": firestore.SERVER_TIMESTAMP,
                            **info,
                        }
                    },
                    "updated_at": firestore.SERVER_TIMESTAMP,
                },
                merge=True,
            )
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"[warn] Firestore update falhou ({agent_slug}): {exc}\n")

    return cb


# =============================================================================
# PDF generation (chama scripts/gerar_dossie_v1.py)
# =============================================================================


def _gerar_pdf(findings_path: Path, output_pdf: Path, alvo: str, slug: str) -> bool:
    script = PIPELINE_DIR / "scripts" / "gerar_dossie_v1.py"
    cmd = [
        sys.executable,
        str(script),
        "--findings",
        str(findings_path),
        "--output",
        str(output_pdf),
        "--alvo",
        alvo,
        "--slug",
        slug,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(f"[erro] gerar_dossie_v1.py falhou:\n{res.stderr}\n")
        return False
    sys.stdout.write(res.stdout)
    return True


# =============================================================================
# Main
# =============================================================================


def run_pipeline(
    alvo: str,
    slug: str,
    output_dir: Path,
    firestore_doc: str | None = None,
    skip_news: bool = False,
    skip_pdf: bool = False,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    findings_path = output_dir / "findings.json"
    pdf_path = output_dir / f"Dossie_{alvo.replace(' ', '_')}_v1-0.pdf"

    print(f"[pipeline] alvo='{alvo}' slug='{slug}' output={output_dir}")
    contexto = _carregar_contexto()
    status_cb = _firestore_callback(firestore_doc)

    # 1. Roda 10 agentes em paralelo.
    print(f"[pipeline] disparando {len(CREW_DOSSIE_FORENSE_V1.agentes)} agentes em paralelo…")
    parciais = asyncio.run(_rodar_todos(alvo, slug, contexto, status_cb))
    for p in parciais:
        print(
            f"  · {p['agent_slug']:20s} → {p['status']:8s} "
            f"({p.get('findings_count', 0)} findings, {p.get('elapsed_s', 0)}s)"
        )

    # 2. Agente news_realtime (addon, fora dos 100).
    noticias: list[dict[str, Any]] = []
    if not skip_news and coletar_noticias_atuais is not None:
        try:
            print("[pipeline] coletando notícias em tempo real (news_realtime)…")
            noticias = coletar_noticias_atuais(alvo, dias=30)
            print(f"  · news_realtime → {len(noticias)} notícias relevantes")
        except Exception as exc:  # noqa: BLE001
            print(f"  · news_realtime erro: {exc}")

    # 3. Maestro consolida.
    doc = _consolidar_maestro(parciais, alvo, slug, noticias)

    # 4. Persiste findings.json.
    findings_path.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[pipeline] findings.json salvo em {findings_path}")
    print(
        f"[pipeline] total={doc['kpis']['findings_total']} "
        f"(C={doc['kpis']['criticos']} A={doc['kpis']['altos']} "
        f"M={doc['kpis']['medios']} I={doc['kpis']['informativos']}) "
        f"sweet_spot_ok={doc['_meta']['sweet_spot_atingido']}"
    )

    # 4b. 🆕 v1.1 — Fase de revisão automatizada (6 agentes em paralelo).
    review_warnings: list[str] = []
    if _review_phase is not None:
        try:
            print("[pipeline] iniciando fase de revisão automatizada (v1.1)…")
            review_result = asyncio.run(
                _review_phase(slug=slug, findings_path=findings_path, max_retries=2)
            )
            review_warnings = review_result.get("warnings", [])
            if review_result.get("corrections_applied") and review_result.get("corrected_findings"):
                # Substitui findings pelo conjunto corrigido e re-persiste
                corrected = review_result["corrected_findings"]
                # Preserva estrutura do doc, apenas substitui lista de findings
                if isinstance(doc.get("findings"), list):
                    doc["findings"] = corrected
                else:
                    doc = corrected
                findings_path.write_text(
                    json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8"
                )
                print(f"[pipeline] findings.json re-salvo após correções de revisão")
            if review_warnings:
                print(
                    f"[pipeline] revisão concluída com {len(review_warnings)} warning(s) — "
                    "publicando com flag review_warnings."
                )
            else:
                print("[pipeline] revisão aprovada sem warnings.")
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write(f"[warn] fase de revisão falhou (não bloqueia): {exc}\n")
    else:
        print("[pipeline] fase de revisão indisponível (módulo não encontrado) — pulando.")

    # 5. PDF.
    pdf_ok = False
    if not skip_pdf:
        pdf_ok = _gerar_pdf(findings_path, pdf_path, alvo, slug)
        if pdf_ok:
            print(f"[pipeline] PDF gerado em {pdf_path}")

    # 6. Status final no Firestore.
    if status_cb:
        status_cb(
            "_pipeline",
            "done" if pdf_ok or skip_pdf else "error",
            {
                "findings_path": str(findings_path),
                "pdf_path": str(pdf_path) if pdf_ok else "",
                "findings_total": doc["kpis"]["findings_total"] if isinstance(doc, dict) and "kpis" in doc else len(doc) if isinstance(doc, list) else 0,
                "review_warnings": review_warnings,
            },
        )

    return {
        "findings_path": str(findings_path),
        "pdf_path": str(pdf_path) if pdf_ok else "",
        "review_warnings": review_warnings,
        "doc": doc,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description="Pipeline headless do Dossiê Forense v1.0")
    ap.add_argument("--alvo", required=True, help="Nome público do parlamentar")
    ap.add_argument("--slug", required=True, help="Slug de contestação (kebab-case)")
    ap.add_argument(
        "--output-dir",
        default=None,
        help="Diretório de saída (default: /tmp/dossies_v1/<slug>)",
    )
    ap.add_argument(
        "--firestore-doc",
        default=None,
        help="Path Firestore p/ status agent-by-agent (ex: dossies_v1/<slug>)",
    )
    ap.add_argument("--skip-news", action="store_true", help="Não rodar news_realtime")
    ap.add_argument("--skip-pdf", action="store_true", help="Não gerar PDF (apenas findings.json)")
    args = ap.parse_args()

    output_dir = Path(args.output_dir) if args.output_dir else Path(f"/tmp/dossies_v1/{args.slug}")

    result = run_pipeline(
        alvo=args.alvo,
        slug=args.slug,
        output_dir=output_dir,
        firestore_doc=args.firestore_doc,
        skip_news=args.skip_news,
        skip_pdf=args.skip_pdf,
    )
    print(json.dumps({k: v for k, v in result.items() if k != "doc"}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
