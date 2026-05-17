"""
Crew adapter — FastAPI na porta 8989 fazendo ponte HTTP para o OpenClaw Gateway.

Variáveis de ambiente (VM):
  OPENCLAW_GATEWAY_URL   Base HTTP do gateway (default: http://127.0.0.1:18789)
  OPENCLAW_GATEWAY_TOKEN Token Bearer para o gateway (recomendado)
  OPENCLAW_GATEWAY_PASSWORD  Senha do gateway, se auth=password (header auxiliar)
  OPENCLAW_DEFAULT_MODEL Modelo OpenResponses enviado ao gateway quando o painel
                         manda modelos tipo gemini/* (default: openclaw:main)
  OPENCLAW_AGENT_FALLBACK_JSON  JSON opcional (lista/object) se GET /v1/agents 404
  PORT                   Porta do adapter (default: 8989)

Rotas expostas ao browser (CORS aberto):
  GET  /health          — sonda /health e /healthz do gateway
  GET  /v1/agents       — repassa listagem real do gateway (fallback opcional)
  POST /v1/responses    — repassa o corpo ao gateway OpenResponses (processamento real)

Segurança: o token do gateway vem só do ambiente da VM; não repassamos Authorization
do cliente para o OpenClaw.
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

logger = logging.getLogger("crew_adapter")

GW_BASE = os.environ.get("OPENCLAW_GATEWAY_URL", "http://127.0.0.1:18789").rstrip("/")
GW_TOKEN = os.environ.get("OPENCLAW_GATEWAY_TOKEN", "").strip()
GW_PASSWORD = os.environ.get("OPENCLAW_GATEWAY_PASSWORD", "").strip()
# Authorization completo opcional (ex.: "Bearer xxx" ou outro esquema suportado pelo GW)
GW_AUTH_RAW = os.environ.get("OPENCLAW_GATEWAY_AUTH", "").strip()
DEFAULT_MODEL = os.environ.get("OPENCLAW_DEFAULT_MODEL", "openclaw:main").strip()
AGENT_FALLBACK_JSON = os.environ.get("OPENCLAW_AGENT_FALLBACK_JSON", "").strip()

TIMEOUT = httpx.Timeout(connect=15.0, read=600.0, write=120.0, pool=15.0)


def _gateway_headers(*, extra: dict[str, str] | None = None) -> dict[str, str]:
    h: dict[str, str] = {"Accept": "application/json, text/plain, */*"}
    if GW_AUTH_RAW:
        h["Authorization"] = GW_AUTH_RAW
    elif GW_TOKEN:
        h["Authorization"] = f"Bearer {GW_TOKEN}"
    if GW_PASSWORD:
        h["X-OpenClaw-Gateway-Password"] = GW_PASSWORD
    if extra:
        h.update({k: v for k, v in extra.items() if v})
    return h


def _normalize_openresponses_model(payload: dict[str, Any]) -> dict[str, Any]:
    """Painéis legados enviam gemini/*; o gateway OpenClaw espera openclaw:… ou agent:…."""
    model = payload.get("model")
    if not isinstance(model, str):
        return payload
    m = model.strip()
    if m == "openclaw" or m.startswith("openclaw:") or m.startswith("agent:"):
        return payload
    out = dict(payload)
    out["model"] = DEFAULT_MODEL
    return out


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.http = httpx.AsyncClient(base_url=GW_BASE, timeout=TIMEOUT, follow_redirects=True)
    logger.info("crew_adapter → OpenClaw gateway base=%s", GW_BASE)
    yield
    await app.state.http.aclose()


app = FastAPI(title="Crew adapter → OpenClaw", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    client: httpx.AsyncClient = app.state.http
    probe: dict[str, Any] = {}
    best_ok = False
    for path in ("/health", "/healthz", "/readyz"):
        try:
            r = await client.get(path, headers=_gateway_headers())
            probe[path] = {"status_code": r.status_code, "snippet": (r.text or "")[:400]}
            if r.status_code < 500:
                best_ok = True
        except Exception as exc:  # noqa: BLE001
            probe[path] = {"error": str(exc)}
    return {
        "status": "online" if best_ok else "degraded",
        "adapter": "crew_adapter",
        "openclaw_gateway": GW_BASE,
        "gateway_probe": probe,
    }


@app.get("/v1/agents")
async def list_agents(request: Request) -> Response:
    client: httpx.AsyncClient = app.state.http
    extra: dict[str, str] = {}
    if request.headers.get("x-openclaw-agent-id"):
        extra["x-openclaw-agent-id"] = request.headers.get("x-openclaw-agent-id", "")
    try:
        r = await client.get("/v1/agents", headers=_gateway_headers(extra=extra or None))
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Gateway unreachable: {exc}") from exc

    if r.status_code == 404 and AGENT_FALLBACK_JSON:
        return Response(content=AGENT_FALLBACK_JSON, media_type="application/json", status_code=200)

    # Algumas builds expõem agentes via /v1/status ou corpo JSON genérico
    if r.status_code == 404:
        try:
            r2 = await client.get("/v1/status", headers=_gateway_headers(extra=extra or None))
            if r2.status_code == 200 and r2.content:
                return Response(
                    content=r2.content,
                    media_type=r2.headers.get("content-type", "application/json"),
                    status_code=200,
                )
        except httpx.RequestError:
            pass
        raise HTTPException(
            status_code=502,
            detail=(
                "Gateway não expõe GET /v1/agents (404). Atualize o OpenClaw, "
                "ou defina OPENCLAW_AGENT_FALLBACK_JSON com a lista JSON dos agentes."
            ),
        )

    ct = r.headers.get("content-type", "application/json")
    return Response(content=r.content, media_type=ct, status_code=r.status_code)


@app.post("/v1/responses")
async def openresponses(request: Request) -> Response:
    raw = await request.body()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty body")

    try:
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("body must be a JSON object")
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {exc}") from exc

    payload = _normalize_openresponses_model(payload)
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

    extra: dict[str, str] = {}
    for hname in ("x-openclaw-agent-id", "x-openclaw-session-key"):
        v = request.headers.get(hname)
        if v:
            extra[hname] = v

    fwd = _gateway_headers(
        extra={
            **extra,
            "Content-Type": request.headers.get("content-type", "application/json"),
        }
    )

    client: httpx.AsyncClient = app.state.http
    stream = bool(payload.get("stream"))

    if stream:
        async def gen():
            try:
                async with client.stream("POST", "/v1/responses", headers=fwd, content=body) as resp:
                    async for chunk in resp.aiter_bytes():
                        yield chunk
            except httpx.RequestError as exc:
                yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n".encode()

        return StreamingResponse(gen(), media_type="text/event-stream")

    try:
        r = await client.post("/v1/responses", headers=fwd, content=body)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Gateway unreachable: {exc}") from exc

    ct = r.headers.get("content-type", "application/json")
    return Response(content=r.content, media_type=ct, status_code=r.status_code)


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    port = int(os.environ.get("PORT", "8989"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
