"""
Execução CrewAI + Gemini por crew (subconjunto de agentes para custo/latência em VM).
"""

from __future__ import annotations

import io
import json
import os
import re
import os
from contextlib import redirect_stderr, redirect_stdout
from typing import Callable

from agent_registry import CREWS, MAESTRO, crew_por_id

# CrewAI / LangChain — import lazy para falhar com mensagem clara
try:
    from crewai import Agent, Crew, Process, Task
    from langchain_google_genai import ChatGoogleGenerativeAI
except ImportError as e:  # pragma: no cover
    Agent = Crew = Process = Task = None  # type: ignore
    ChatGoogleGenerativeAI = None  # type: ignore
    _IMPORT_ERR = str(e)
else:
    _IMPORT_ERR = ""


_WEB_INSTR = (
    "\n\n**Internet:** Usa a ferramenta de pesquisa web sempre que precisares de dados, datas, nomes ou URLs "
    "que não estejam no teu contexto. Cita brevemente as fontes (título ou domínio). Se a web não ajudar, "
    "diz o que falta (ex.: base interna, BigQuery) em vez de inventar."
)


def _internet_tools() -> tuple[list, str]:
    """
    Ferramentas LangChain compatíveis com CrewAI (pesquisa aberta na internet).
    Desliga com MANUS_INTERNET_TOOLS=false em ambientes sem rede.
    """
    flag = os.environ.get("MANUS_INTERNET_TOOLS", "true").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return [], "MANUS_INTERNET_TOOLS desativado — agentes sem pesquisa web."
    try:
        from langchain_community.tools import DuckDuckGoSearchRun

        return [DuckDuckGoSearchRun()], ""
    except ImportError as e:  # pragma: no cover
        return [], f"Dependências web em falta (pip install -r requirements.txt): {e}"


def _api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def _model() -> str:
    return (os.environ.get("MANUS_GEMINI_MODEL") or "gemini-2.5-pro").strip()


def _silence_crewai_tracing() -> None:
    """CrewAI >=0.76 pede confirmação de traces com input(); em Streamlit/nohup isso quebra (Bad file descriptor)."""
    os.environ.setdefault("CREWAI_TESTING", "true")
    os.environ.setdefault("CREWAI_TRACING_ENABLED", "false")
    os.environ.setdefault("OTEL_SDK_DISABLED", "true")
    os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
    os.environ.setdefault("CREWAI_DISABLE_TRACING", "true")
    os.environ.setdefault("CREWAI_TELEMETRY", "false")
    try:
        from crewai.events.listeners.tracing.utils import set_suppress_tracing_messages

        set_suppress_tracing_messages(True)
    except ImportError:
        pass


def build_llm():
    if ChatGoogleGenerativeAI is None:
        raise RuntimeError(f"CrewAI / langchain_google_genai não instalados: {_IMPORT_ERR}")
    key = _api_key()
    if not key:
        raise RuntimeError("Defina GEMINI_API_KEY ou GOOGLE_API_KEY no ambiente da VM.")
    return ChatGoogleGenerativeAI(
        model=_model(),
        temperature=float(os.environ.get("MANUS_GEMINI_TEMP", "0.2")),
        google_api_key=key,
    )


def _catalogo_crews() -> str:
    return "\n".join(f'- "{c.id}": {c.emoji} {c.nome} — {c.missao}' for c in CREWS)


def _parse_json_crew(text: str) -> dict | None:
    raw = text.strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.IGNORECASE | re.MULTILINE)
    raw = re.sub(r"\s*```\s*$", "", raw)
    start, end = raw.find("{"), raw.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(raw[start : end + 1])
    except json.JSONDecodeError:
        return None


def _fallback_crew_id(instrucao: str) -> tuple[str, str]:
    s = instrucao.lower()
    rules: list[tuple[str, tuple[str, ...]]] = [
        ("crew-forense", ("ceap", "benford", "forense", "nota fiscal", "fornecedor", "despesa parlamentar")),
        ("crew-emendas", ("emenda", "pix", "beneficiário", "beneficiario", "repasse")),
        ("crew-pncp", ("pncp", "contrato", "dispensa", "licitação", "licitacao", "vencedor")),
        ("crew-patrimonio", ("patrimônio", "patrimonio", "tse", "declaração", "declaracao", "bens")),
        ("crew-gabinete", ("gabinete", "assessor", "parentesco", "sócio", "socio", "vínculo", "vinculo")),
        ("crew-viagens", ("viagem", "pedágio", "pedagio", "passagem", "rodovia")),
        ("crew-osint", ("osint", "mídia", "midia", "redes sociais", "notícia", "noticia")),
        ("crew-risco", ("risco", "score", "priorização", "priorizacao", "modelo")),
        ("crew-dossie", ("dossiê", "dossie", "relatório executivo", "relatorio executivo", "síntese", "sintese")),
        ("crew-deploy", ("deploy", "streamlit", "site", "código", "codigo", "api", "infra", "cloud run")),
    ]
    for crew_id, kws in rules:
        if any(k in s for k in kws):
            return crew_id, "roteamento por palavra-chave (fallback)"
    return "crew-dossie", "fallback genérico — consolidação / narrativa"


def maestro_escolher_crew(
    instrucao: str,
    *,
    log_cb: Callable[[str], None] | None = None,
) -> tuple[str, str]:
    """
    O Maestro (Gemini) escolhe uma crew registada; se o JSON falhar, usa heurística local.
    Devolve (crew_id, motivo).
    """
    if ChatGoogleGenerativeAI is None:
        raise RuntimeError(f"CrewAI / langchain_google_genai não instalados: {_IMPORT_ERR}")

    allowed = {c.id for c in CREWS}
    llm = build_llm()
    prompt = (
        f"És o {MAESTRO.nome}. {MAESTRO.papel}\n\n"
        f"Pedido do utilizador:\n\"\"\"\n{instrucao.strip()}\n\"\"\"\n\n"
        "Crews disponíveis (tens de devolver exatamente um crew_id desta lista):\n"
        f"{_catalogo_crews()}\n\n"
        'Responde APENAS com JSON válido, sem markdown nem texto extra, no formato:\n'
        '{"crew_id":"<id>","motivo":"<uma frase curta em português>"}'
    )
    resp = llm.invoke(prompt)
    text = (getattr(resp, "content", None) or str(resp)).strip()
    data = _parse_json_crew(text)
    if isinstance(data, dict):
        cid = str(data.get("crew_id", "")).strip()
        motivo = str(data.get("motivo", "")).strip() or "(sem motivo)"
        if cid in allowed:
            if log_cb:
                log_cb(f"▶ Maestro escolheu: {cid} — {motivo}")
            return cid, motivo
    if log_cb:
        log_cb("▶ Maestro: JSON inválido ou id desconhecido; a usar fallback heurístico.")
    cid_fb, why = _fallback_crew_id(instrucao)
    if log_cb:
        log_cb(f"▶ Crew por fallback: {cid_fb} ({why})")
    return cid_fb, why


def run_crew(
    crew_id: str,
    instrucao: str,
    *,
    max_agents: int = 3,
    log_cb: Callable[[str], None] | None = None,
) -> str:
    """
    Corre uma crew com até `max_agents` agentes CrewAI (sequencial) + consolidação pelo Maestro como agente final.
    """
    if Agent is None:
        raise RuntimeError(f"Dependências em falta: {_IMPORT_ERR}")

    _silence_crewai_tracing()

    crew_meta = crew_por_id(crew_id)
    if crew_meta is None:
        raise ValueError(f"Crew desconhecida: {crew_id}")

    llm = build_llm()
    buf = io.StringIO()

    def log(msg: str) -> None:
        buf.write(msg + "\n")
        if log_cb:
            log_cb(msg)

    log(f"▶ Maestro: {MAESTRO.nome}")
    log(f"▶ Crew: {crew_meta.emoji} {crew_meta.nome} ({len(crew_meta.agentes)} agentes registados; executando {max_agents})")

    tools, tools_msg = _internet_tools()
    if tools_msg:
        log(f"▶ Ferramentas web: {tools_msg}")
    else:
        log("▶ Ferramentas web: DuckDuckGoSearch ativa em todos os agentes desta corrida (operadores + Maestro).")

    agents_meta = list(crew_meta.agentes)[:max_agents]
    agents: list = []
    for a in agents_meta:
        agents.append(
            Agent(
                role=a.nome[:80],
                goal=f"Executar a missão da crew com rigor factual. {crew_meta.missao}",
                backstory=a.papel[:4000],
                llm=llm,
                tools=tools,
                verbose=False,
            )
        )

    consolidador = Agent(
        role=MAESTRO.nome[:80],
        goal=(
            "Consolidar outputs dos operadores num único entregável claro, sem inventar números. "
            "Valida afirmações factuais com pesquisa web quando necessário."
        ),
        backstory=MAESTRO.papel[:4000],
        llm=llm,
        tools=tools,
        goal="Consolidar outputs dos operadores num único entregável claro, sem inventar números.",
        backstory=MAESTRO.papel[:4000],
        llm=llm,
        verbose=False,
    )

    tasks: list = []
    for i, ag in enumerate(agents):
        tasks.append(
            Task(
                description=(
                    f"({i + 1}/{len(agents)}) Instrução do operador:\n{instrucao}\n\n"
                    f"Contexto crew: {crew_meta.missao}\n"
                    "Se não tiveres dados concretos, lista o que falta obter (ex.: query BigQuery) em vez de simular."
                    + _WEB_INSTR
                ),
                expected_output="Relatório curto em pt-BR com bullets e próximos passos.",
                agent=ag,
            )
        )

    final = Task(
        description=(
            "Consolida os relatórios anteriores num resumo executivo (máx. 12 linhas).\n"
            f"Pedido original:\n{instrucao}"
            + _WEB_INSTR
        ),
        expected_output="Resumo executivo em pt-BR.",
        agent=consolidador,
        context=tasks,
    )
    all_tasks = tasks + [final]

    crew_kw = dict(
    crew = Crew(
        agents=agents + [consolidador],
        tasks=all_tasks,
        process=Process.sequential,
        verbose=False,
    )
    try:
        crew = Crew(**crew_kw, tracing=False)
    except TypeError:
        crew = Crew(**crew_kw)

    log("▶ kickoff()…")
    try:
        with redirect_stdout(buf), redirect_stderr(buf):
            result = crew.kickoff()
    except Exception as exc:  # noqa: BLE001
        log(f"ERRO kickoff: {exc!r}")
        raise
    out = str(result).strip()
    log("▶ concluído.")
    return buf.getvalue() + "\n---\nRESULTADO:\n" + out
