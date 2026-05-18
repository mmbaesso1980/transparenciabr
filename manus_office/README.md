# Meu Manus — Escritório (VM)

Registo **10 crews × 10 agentes** focadas em **transparência / dados públicos** (CEAP, PNCP, TSE, etc.). O **Maestro** escolhe a crew por pedido. Rostos tipo *WebForge* (100 agentes dev full-stack) são domínio separado (A.S.M.O.D.E.U.S.) e não substituem esta tabela sem migração explícita.

## Instalação (uma vez)

```bash
cd ~/transparenciabr/manus_office
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export GEMINI_API_KEY="…"
export MANUS_GEMINI_MODEL="gemini-2.5-pro"   # opcional
# CrewAI: evita prompt interativo de traces (Streamlit / nohup)
export CREWAI_TESTING=true
export CREWAI_TRACING_ENABLED=false
export OTEL_SDK_DISABLED=true
```

## Correr o dashboard

```bash
cd ~/transparenciabr/manus_office
source .venv/bin/activate
export GEMINI_API_KEY="…"
streamlit run app.py --server.address 0.0.0.0 --server.port 8501
```

## HTTPS (browser remoto)

Na mesma VM, noutro terminal:

```bash
cloudflared tunnel --url http://127.0.0.1:8501
```

Usa a URL `https://….trycloudflare.com` gerada.

## Ativar missão

1. Abre o Streamlit.
2. Escreve a missão (o **Maestro** escolhe automaticamente a crew mais adequada via Gemini; há fallback por palavras-chave se o JSON falhar).
3. Clica **Ativar missão (Maestro + CrewAI)**.
4. Lê o painel de logs (escolha da crew + kickoff na VM).

Opcional: em **Avançado**, podes forçar uma crew manualmente.
