"""
Escritório virtual Meu Manus — Streamlit na VM.
CrewAI + Gemini. Lista 100 agentes (10×10) + Maestro; o Maestro escolhe a crew e ativa um subconjunto de agentes.
CrewAI + Gemini. Lista 100 agentes (10×10) + Maestro; ativa crew com subconjunto de agentes.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import streamlit as st

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from agent_registry import CREWS, MAESTRO, total_agentes_crews  # noqa: E402

st.set_page_config(
    page_title="Meu Manus — Escritório",
    page_icon="🎯",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
<style>
  .stApp { background-color: #0e1117; }
  div[data-testid="stSidebar"] { background-color: #161b22; }
</style>
""",
    unsafe_allow_html=True,
)


def _append_log(line: str) -> None:
    st.session_state.setdefault("log_lines", [])
    st.session_state["log_lines"].append(line)
    if len(st.session_state["log_lines"]) > 400:
        st.session_state["log_lines"] = st.session_state["log_lines"][-400:]


def main() -> None:
    st.title("🎯 Meu Manus — Escritório virtual")
    st.caption("VM only · CrewAI + Gemini · Maestro Supremo escolhe a crew automaticamente")
    st.caption("VM only · CrewAI + Gemini · Maestro = Elon Musk de Execução")

    with st.sidebar:
        st.subheader("Configuração")
        key = st.text_input("GEMINI_API_KEY (ou define env)", type="password", value=os.environ.get("GEMINI_API_KEY", ""))
        if key:
            os.environ["GEMINI_API_KEY"] = key
        model = st.text_input("Modelo Gemini", value=os.environ.get("MANUS_GEMINI_MODEL", "gemini-2.5-pro"))
        os.environ["MANUS_GEMINI_MODEL"] = model
        depth = st.slider(
            "Agentes CrewAI por ativação (custo)",
            1,
            10,
            3,
            help="Cada crew tem 10 registados; só N entram no kickoff. Todos usam pesquisa web (DuckDuckGo) quando ativos.",
        )
        depth = st.slider("Agentes CrewAI por ativação (custo)", 1, 5, 3, help="Cada crew tem 10 registados; só N entram no kickoff.")
        st.divider()
        st.markdown(
            "**Túnel (HTTPS para browser)**  \n"
            "- `cloudflared tunnel --url http://127.0.0.1:8501`  \n"
            "- ou `ssh -R 80:localhost:8501 ssh.localhost.run`  \n"
            "Copia a URL `https://…` e abre no teu PC."
        )

    col_a, col_b = st.columns((1, 1))

    with col_a:
        st.subheader("Maestro")
        st.write(f"{MAESTRO.avatar} **{MAESTRO.nome}**")
        st.caption(MAESTRO.papel)

        st.subheader(f"Crews ({len(CREWS)}) · {total_agentes_crews()} agentes")
        st.caption("O Maestro analisa o teu pedido e escolhe a crew mais adequada (Gemini + fallback por palavras-chave).")
        with st.expander("Crews disponíveis", expanded=False):
            for c in CREWS:
                st.markdown(f"**{c.emoji} `{c.id}`** — {c.nome}  \n{c.missao}")
        crew_labels = {c.id: f"{c.emoji} {c.nome}" for c in CREWS}
        manual = st.expander("Avançado: forçar crew manualmente", expanded=False)
        with manual:
            force = st.checkbox("Usar crew fixa em vez do Maestro", value=False)
            forced_id = st.selectbox(
                "Crew",
                options=list(crew_labels.keys()),
                format_func=lambda x: crew_labels[x],
                disabled=not force,
            )
        crew_labels = {c.id: f"{c.emoji} {c.nome}" for c in CREWS}
        crew_id = st.selectbox("Escolhe a crew", options=list(crew_labels.keys()), format_func=lambda x: crew_labels[x])
        crew = next(c for c in CREWS if c.id == crew_id)
        st.caption(crew.missao)
        with st.expander("Agentes desta crew", expanded=False):
            for a in crew.agentes:
                st.write(f"{a.avatar} `{a.id}` — **{a.nome}**")

    with col_b:
        st.subheader("Missão")
        instr = st.text_area(
            "Instrução (o Maestro roteia para a crew certa)",
            height=160,
            placeholder="Ex.: Auditar CEAP 2025 com Benford e fornecedores; ou descrever deploy Cloud Run do painel.",
        )
        run = st.button("▶ Ativar missão (Maestro + CrewAI)", type="primary", use_container_width=True)
            "Instrução para a crew",
            height=160,
            placeholder="Ex.: Esboçar checklist forense para auditar CEAP 2025 sem inventar números.",
        )
        run = st.button("▶ Ativar crew (CrewAI)", type="primary", use_container_width=True)

    st.subheader("Logs / status")
    log_box = st.empty()

    if run:
        if not instr.strip():
            st.warning("Escreve uma instrução.")
        elif not (os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")):
            st.error("Falta GEMINI_API_KEY (sidebar ou export na VM).")
        else:
            try:
                from crews_runner import maestro_escolher_crew, run_crew

                _append_log("— início kickoff —")
                if force:
                    crew_id = forced_id
                    _append_log(f"▶ Modo manual: crew fixa `{crew_id}`")
                else:
                    with st.spinner("Maestro a escolher a crew…"):
                        crew_id, _mot = maestro_escolher_crew(instr.strip(), log_cb=_append_log)
                with st.spinner("Crew a correr na VM…"):
                    out = run_crew(crew_id, instr.strip(), max_agents=depth, log_cb=_append_log)
                _append_log(out)
                st.success("Missão concluída. Vê o log abaixo.")
                from crews_runner import run_crew

                _append_log("— início kickoff —")
                with st.spinner("Crew a correr na VM…"):
                    out = run_crew(crew_id, instr.strip(), max_agents=depth, log_cb=_append_log)
                _append_log(out)
                st.success("Crew concluída. Vê o log abaixo.")
            except Exception as e:  # noqa: BLE001
                _append_log(f"ERRO: {e!r}")
                st.exception(e)

    lines = st.session_state.get("log_lines", [])
    log_box.code("\n".join(lines) if lines else "(sem eventos ainda)", language="text")


if __name__ == "__main__":
    main()
