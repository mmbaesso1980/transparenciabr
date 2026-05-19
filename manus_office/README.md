# Meu Manus — Escritório (VM)

Registo **10 crews × 10 agentes** (100 operadores) focados em **transparência / dados públicos**. Cada agente **pode pesquisar na internet** durante o kickoff (`DuckDuckGoSearch` via LangChain); o Maestro consolidador usa a mesma ferramenta. Ajusta o slider no app para até **10 agentes** por corrida (custo proporcional). `MANUS_INTERNET_TOOLS=false` desliga a web em ambientes fechados. Rostos *WebForge* (dev full-stack) continuam fora desta tabela até migração explícita.

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
# Pesquisa web nos agentes CrewAI (DuckDuckGo). VM precisa de saída HTTPS. Desliga com:
# export MANUS_INTERNET_TOOLS=false
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
## Ativar crew

1. Abre o Streamlit.
2. Escreve a **instrução global** (todas as crews interpretam na sua área).
3. **LEGIÃO 100** (botão principal): corre as **10 crews em sequência**, cada uma com **10 agentes** (100 no total), com pesquisa web quando `MANUS_INTERNET_TOOLS` está ativo; no fim o **Maestro** (Gemini) gera um **script operacional unificado** (runbook + tendências SOTA + matriz de lacunas). **Custo e tempo muito altos.**
4. **Missão rápida**: uma só crew — o Maestro escolhe (ou forças crew em **Avançado**); o slider define quantos operadores entram (1–10).

Lê o painel de logs (até ~3000 linhas guardadas em sessão para corridas longas).

Opcional: em **Avançado**, podes forçar uma crew na missão rápida.
