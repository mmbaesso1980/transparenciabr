# Meu Manus — Escritório (VM)

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

## Ativar crew

1. Abre o Streamlit.
2. Escolhe a crew.
3. Escreve a missão.
4. Clica **Ativar crew (CrewAI)**.
5. Lê o painel de logs (kickoff real na VM).
