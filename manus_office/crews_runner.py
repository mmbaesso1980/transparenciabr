"""
Execução CrewAI + Gemini por crew (subconjunto de agentes para custo/latência em VM).
"""

from __future__ import annotations

import io
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


def _api_key() -> str:
    return (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY") or "").strip()


def _model() -> str:
    return (os.environ.get("MANUS_GEMINI_MODEL") or "gemini-2.5-pro").strip()


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

    agents_meta = list(crew_meta.agentes)[:max_agents]
    agents: list = []
    for a in agents_meta:
        agents.append(
            Agent(
                role=a.nome[:80],
                goal=f"Executar a missão da crew com rigor factual. {crew_meta.missao}",
                backstory=a.papel[:4000],
                llm=llm,
                verbose=False,
            )
        )

    consolidador = Agent(
        role=MAESTRO.nome[:80],
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
                ),
                expected_output="Relatório curto em pt-BR com bullets e próximos passos.",
                agent=ag,
            )
        )

    final = Task(
        description=(
            "Consolida os relatórios anteriores num resumo executivo (máx. 12 linhas).\n"
            f"Pedido original:\n{instrucao}"
        ),
        expected_output="Resumo executivo em pt-BR.",
        agent=consolidador,
        context=tasks,
    )
    all_tasks = tasks + [final]

    crew = Crew(
        agents=agents + [consolidador],
        tasks=all_tasks,
        process=Process.sequential,
        verbose=False,
    )

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
