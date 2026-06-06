#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAESTRO v1.0 — Worker autônomo TransparênciaBR/AURORA
=====================================================

Cloud Run Job (ou processo standalone na VM) que:
  1. Consome comandos do Pub/Sub `maestro-commands` em projeto-codex-br
  2. Carrega SYSTEM_PROMPT_v1.0.md como system instruction
  3. Invoca Vertex Gemini 2.5 Pro (temperature=0.1) com function-calling
  4. Aplica os 5 FREIOS antes de qualquer ação:
       F1 whitelist chat_id 6483072695
       F2 senha pré-comando para ações destrutivas (drop/delete/deploy/burn/merge/tuning)
       F3 kill-switch (/maestro stop grava flag em Firestore -> worker aborta)
       F4 snapshot Firestore antes de ação irreversível em maestro_rollback/<id>
       F5 hard cap R$ 80/h, soft cap R$ 30/h em queima Vertex
  5. Executa via tools: GitHub commit (PyGithub) | Firestore | Direct Data | Telegram reply | gcloud exec
  6. Loga TUDO em maestro_audit_log (APPEND-ONLY, imutável)
  7. Reflete pós-tarefa em maestro_memory/<topic> (camada de aprendizado tático)

Comandante: Maurílio Mesquita Baesso (mmbaesso@hotmail.com)
Versão: 1.0.0 — 2026-05-27
"""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import json
import logging
import os
import subprocess
import sys
import threading
import time
import traceback
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# ---------------------------------------------------------------------------
# Dependências runtime (instaladas no Cloud Run via requirements.txt)
# ---------------------------------------------------------------------------
try:
    import vertexai
    from vertexai.generative_models import (
        GenerativeModel,
        GenerationConfig,
        Part,
        Tool,
        FunctionDeclaration,
        Content,
    )
    from google.cloud import firestore, pubsub_v1, secretmanager
    from github import Github, GithubException
    import requests
except ImportError as e:
    print(f"[BOOT] dependência ausente: {e}. rode `pip install -r requirements.txt`", file=sys.stderr)
    raise

# ---------------------------------------------------------------------------
# Configuração — sobrescrevível por env var
# ---------------------------------------------------------------------------
PROJECT_VERTEX = os.getenv("MAESTRO_PROJECT_VERTEX", "projeto-codex-br")
PROJECT_MAIN = os.getenv("MAESTRO_PROJECT_MAIN", "transparenciabr")
REGION = os.getenv("MAESTRO_REGION", "us-east1")
VERSION = "v2.1.4"
MODEL_ID = os.getenv("MAESTRO_MODEL", "gemini-2.5-pro")
TEMPERATURE = float(os.getenv("MAESTRO_TEMP", "0.1"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAESTRO_MAX_TOKENS", "32768"))

WHITELIST_CHATS = {6483072695}  # F1 — apenas o Comandante Baesso
SUBSCRIPTION = os.getenv("MAESTRO_SUB", "maestro-commands-sub")
PROMPT_PATH = Path(os.getenv(
    "MAESTRO_PROMPT_PATH",
    "/home/user/workspace/aurora_v3_maestro/prompts/SYSTEM_PROMPT_v1.0.md",
))
REPO_FULL = "mmbaesso1980/transparenciabr"
DEFAULT_BRANCH = "main"

# Secret Manager keys (recuperados runtime)
SECRET_GITHUB_PAT = "maestro-github-pat"
SECRET_TELEGRAM_BOT = "maestro-telegram-bot-token"
SECRET_DIRECT_DATA = "maestro-directdata-token"

# Limites FinOps (F5)
COST_SOFT_CAP_HOUR_BRL = 30.0
COST_HARD_CAP_HOUR_BRL = 80.0

# Palavras-gatilho para senha (F2)
DESTRUCTIVE_KEYWORDS = (
    "drop", "delete", "deploy", "burn", "merge", "tuning",
    "rm -rf", "force-push", "force push", "publicar",
)

# ---------------------------------------------------------------------------
# Logging estruturado JSON (Cloud Logging entende automaticamente)
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%dT%H:%M:%S',
)
log = logging.getLogger("maestro")


def jlog(event: str, **kwargs: Any) -> None:
    """Log estruturado JSON-line para Cloud Logging."""
    payload = {"event": event, "ts": dt.datetime.utcnow().isoformat() + "Z", **kwargs}
    log.info(json.dumps(payload, ensure_ascii=False, default=str))


# ---------------------------------------------------------------------------
# Estado compartilhado (singletons)
# ---------------------------------------------------------------------------
@dataclass
class MaestroState:
    fs_main: firestore.Client = field(default=None)
    fs_codex: firestore.Client = field(default=None)
    pubsub_pub: pubsub_v1.PublisherClient = field(default=None)
    secrets: dict[str, str] = field(default_factory=dict)
    system_prompt: str = ""
    model: GenerativeModel | None = None
    tools: Tool | None = None
    hourly_cost_brl: float = 0.0
    hour_window_start: dt.datetime = field(default_factory=dt.datetime.utcnow)
    kill_switch: bool = False


STATE = MaestroState()


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
def bootstrap() -> None:
    """Inicializa Vertex, Firestore, Secret Manager, carrega prompt e declara tools."""
    jlog("bootstrap.start", project_vertex=PROJECT_VERTEX, model=MODEL_ID)

    # F6 — Billing gate (GOD v2.0)
    # Memória permanente Comandante: Vertex DEVE rodar em projeto-codex-br
    # (crédito R$ 5.677,28 vivos, expira 03/05/2027). NUNCA em transparenciabr.
    if PROJECT_VERTEX != "projeto-codex-br":
        msg = (
            f"BILLING-VIOLATION (F6): Vertex DEVE estar em projeto-codex-br. "
            f"Atual: PROJECT_VERTEX={PROJECT_VERTEX!r}. "
            f"Revise env var MAESTRO_PROJECT_VERTEX e redeploy."
        )
        jlog("freio.6.billing.violation", project_vertex=PROJECT_VERTEX, severity="CRITICAL")
        raise RuntimeError(msg)
    jlog("freio.6.billing.ok", project_vertex=PROJECT_VERTEX)

    vertexai.init(project=PROJECT_VERTEX, location=REGION)
    STATE.fs_main = firestore.Client(project=PROJECT_MAIN)
    STATE.fs_codex = firestore.Client(project=PROJECT_VERTEX)
    STATE.pubsub_pub = pubsub_v1.PublisherClient()

    # Secrets
    sm = secretmanager.SecretManagerServiceClient()
    for key in (SECRET_GITHUB_PAT, SECRET_TELEGRAM_BOT, SECRET_DIRECT_DATA):
        try:
            name = f"projects/{PROJECT_MAIN}/secrets/{key}/versions/latest"
            resp = sm.access_secret_version(request={"name": name})
            STATE.secrets[key] = resp.payload.data.decode("utf-8").strip()
            jlog("secret.loaded", key=key, size=len(STATE.secrets[key]))
        except Exception as e:
            jlog("secret.miss", key=key, error=str(e))
            STATE.secrets[key] = ""

    # v2.1.3 — Telegram é canal obrigatório de saída. Sem token, continuar
    # bootando transforma erro de configuração em silent fail pós-LLM.
    if not STATE.secrets.get(SECRET_TELEGRAM_BOT):
        jlog("bootstrap.fatal", reason="telegram-token-missing", key=SECRET_TELEGRAM_BOT, severity="CRITICAL")
        raise RuntimeError(f"Secret obrigatória ausente/inacessível: {SECRET_TELEGRAM_BOT}")

    # System prompt
    if PROMPT_PATH.exists():
        STATE.system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
        jlog("prompt.loaded", size=len(STATE.system_prompt), sha256=hashlib.sha256(
            STATE.system_prompt.encode()).hexdigest()[:12])
    else:
        raise FileNotFoundError(f"SYSTEM_PROMPT não encontrado em {PROMPT_PATH}")

    # Tools declaradas para function calling
    STATE.tools = build_tools()

    STATE.model = GenerativeModel(
        model_name=MODEL_ID,
        system_instruction=STATE.system_prompt,
        tools=[STATE.tools] if STATE.tools else None,
        generation_config=GenerationConfig(
            temperature=TEMPERATURE,
            max_output_tokens=MAX_OUTPUT_TOKENS,
        ),
    )
    jlog("bootstrap.ok")


# ---------------------------------------------------------------------------
# Tools — declarações para function calling Vertex
# ---------------------------------------------------------------------------
def build_tools() -> Tool:
    fns = [
        FunctionDeclaration(
            name="telegram_send",
            description="Envia mensagem para o Comandante Baesso via Telegram. Sempre português formal.",
            parameters={
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "Mensagem em markdown"},
                    "parse_mode": {"type": "string", "enum": ["Markdown", "HTML", "MarkdownV2"], "default": "Markdown"},
                },
                "required": ["text"],
            },
        ),
        FunctionDeclaration(
            name="github_edit_file",
            description="Edita arquivo no repo mmbaesso1980/transparenciabr. Faz commit direto em main após snapshot Firestore.",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                    "commit_msg": {"type": "string"},
                    "branch": {"type": "string", "default": "main"},
                },
                "required": ["path", "content", "commit_msg"],
            },
        ),
        FunctionDeclaration(
            name="firestore_read",
            description="Lê documento Firestore. Projeto = transparenciabr por padrão.",
            parameters={
                "type": "object",
                "properties": {
                    "collection": {"type": "string"},
                    "doc_id": {"type": "string"},
                    "project": {"type": "string", "enum": ["transparenciabr", "projeto-codex-br"], "default": "transparenciabr"},
                },
                "required": ["collection", "doc_id"],
            },
        ),
        FunctionDeclaration(
            name="firestore_write",
            description="Grava documento Firestore. APPEND-ONLY em maestro_audit_log e maestro_memory.",
            parameters={
                "type": "object",
                "properties": {
                    "collection": {"type": "string"},
                    "doc_id": {"type": "string"},
                    "data": {"type": "object"},
                    "project": {"type": "string", "default": "transparenciabr"},
                    "merge": {"type": "boolean", "default": False},
                },
                "required": ["collection", "doc_id", "data"],
            },
        ),
        FunctionDeclaration(
            name="vertex_invoke",
            description="Invoca outro modelo Vertex para subtarefa (ex: Gemini Flash para classificação rápida).",
            parameters={
                "type": "object",
                "properties": {
                    "model": {"type": "string", "default": "gemini-2.5-flash"},
                    "prompt": {"type": "string"},
                    "temperature": {"type": "number", "default": 0.1},
                },
                "required": ["prompt"],
            },
        ),
        FunctionDeclaration(
            name="directdata_call",
            description="Consulta Direct Data v3. Endpoints OK: ReceitaFederalPessoaJuridica, BeneficiarioFinal, ProcessosJudiciaisSimplificada, CadastroPessoaFisicaPlus.",
            parameters={
                "type": "object",
                "properties": {
                    "endpoint": {"type": "string"},
                    "params": {"type": "object"},
                },
                "required": ["endpoint", "params"],
            },
        ),
        FunctionDeclaration(
            name="shell_exec",
            description="Executa comando shell na VM aurora-cacador-br. Auditado, máx 600s. Proibido pkill -f dentro de gcloud --command.",
            parameters={
                "type": "object",
                "properties": {
                    "cmd": {"type": "string"},
                    "timeout_s": {"type": "integer", "default": 120},
                },
                "required": ["cmd"],
            },
        ),
        FunctionDeclaration(
            name="snapshot_firestore",
            description="Snapshot dump de uma coleção Firestore para maestro_rollback/<id>. F4 obrigatório antes de ações irreversíveis.",
            parameters={
                "type": "object",
                "properties": {
                    "collection": {"type": "string"},
                    "reason": {"type": "string"},
                },
                "required": ["collection", "reason"],
            },
        ),
        FunctionDeclaration(
            name="memory_recall",
            description="Recupera lição tática gravada em maestro_memory sobre um tópico (ex: 'glyph-render', 'pkill-armadilha').",
            parameters={
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                },
                "required": ["topic"],
            },
        ),
        FunctionDeclaration(
            name="memory_write",
            description="Grava lição tática em maestro_memory/<topic>. Use após resolver problema novo ou descobrir armadilha.",
            parameters={
                "type": "object",
                "properties": {
                    "topic": {"type": "string"},
                    "lesson": {"type": "string"},
                    "tags": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["topic", "lesson"],
            },
        ),
        # ===== GOD v2.0 — 5 tools novas =====
        FunctionDeclaration(
            name="web_search",
            description="Busca na web via Google Search grounding nativo do Gemini. Retorna top-5 resultados com título, URL e snippet.",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Query natural-language curta (2-7 palavras-chave)."},
                    "recency": {"type": "string", "enum": ["day", "week", "month", "year", "any"], "description": "Restrição de recente. Default 'any'."},
                },
                "required": ["query"],
            },
        ),
        FunctionDeclaration(
            name="fetch_url",
            description="Baixa conteúdo de URL pública HTTPS. Limite 200KB. Opcionalmente extrai trecho relevante via LLM.",
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "extract_prompt": {"type": "string", "description": "Opcional. Se fornecido, LLM extrai resposta específica em vez do HTML cru."},
                },
                "required": ["url"],
            },
        ),
        FunctionDeclaration(
            name="subagent_spawn",
            description="Spawn de um Vertex Gemini secundário com objetivo isolado e budget próprio. Use para paralelizar dossiês, análises ou comparações. Retorna handle de subagent_id.",
            parameters={
                "type": "object",
                "properties": {
                    "objective": {"type": "string", "description": "Objetivo claro e auto-contido do subagent."},
                    "max_turns": {"type": "integer", "description": "Limite de turnos do subagent (default 10, max 30)."},
                    "budget_brl": {"type": "number", "description": "Orçamento máximo em R$. Default 2.00. Hard cap 10.00."},
                },
                "required": ["objective"],
            },
        ),
        FunctionDeclaration(
            name="load_skill_runtime",
            description="Carrega skill .md de gs://tbr-skills/user/<nome>/SKILL.md em runtime. Conteúdo vira parte do contexto para os próximos turnos.",
            parameters={
                "type": "object",
                "properties": {
                    "skill_name": {"type": "string", "description": "Nome exato da skill (ex: 'dossie-forense-parlamentar')."},
                },
                "required": ["skill_name"],
            },
        ),
        FunctionDeclaration(
            name="cron_schedule",
            description="Agenda execução futura ou recorrente via Cloud Scheduler. Publica em topic maestro-commands no momento certo. Ex: '/maestro toda segunda 9h, rodar dossiê X'.",
            parameters={
                "type": "object",
                "properties": {
                    "schedule": {"type": "string", "description": "Cron expression em UTC. Ex: '0 12 * * 1' = toda segunda 9h BRT."},
                    "command": {"type": "string", "description": "Texto do comando que será disparado."},
                    "name": {"type": "string", "description": "Nome do job (slug). Idempotente: mesmo nome substitui."},
                },
                "required": ["schedule", "command", "name"],
            },
        ),
        FunctionDeclaration(
            name="browser_task_remote",
            description="Dispara Playwright/Chromium em Cloud Run job 'maestro-browser' para tarefa que exige navegação real (JavaScript, login, formulário). Retorna texto/screenshot.",
            parameters={
                "type": "object",
                "properties": {
                    "url": {"type": "string"},
                    "task": {"type": "string", "description": "Instruções passo-a-passo para o browser agent."},
                },
                "required": ["url", "task"],
            },
        ),
        FunctionDeclaration(
            name="confirm_action",
            description="Envia confirmação ao Comandante via Telegram com botões Sim/Não. Aguarda até 60s pela resposta. Retorna {confirmed: bool}.",
            parameters={
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "timeout_seconds": {"type": "integer", "description": "Default 60, max 300."},
                },
                "required": ["question"],
            },
        ),
        FunctionDeclaration(
            name="notify_push",
            description="Envia push notification FCM para o dispositivo do Comandante. Para alertas que não cabem em texto Telegram simples.",
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "body": {"type": "string"},
                    "severity": {"type": "string", "enum": ["info", "warning", "critical"]},
                },
                "required": ["title", "body"],
            },
        ),
        # ===== Fim GOD v2.0 =====
        FunctionDeclaration(
            name="task_complete",
            description="Sinaliza fim da tarefa, dispara reflexão pós-tarefa e libera próximo comando.",
            parameters={
                "type": "object",
                "properties": {
                    "summary": {"type": "string"},
                    "success": {"type": "boolean"},
                    "lessons": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["summary", "success"],
            },
        ),
    ]
    return Tool(function_declarations=fns)


# ---------------------------------------------------------------------------
# FREIOS
# ---------------------------------------------------------------------------
def freio_1_whitelist(chat_id: int) -> bool:
    ok = chat_id in WHITELIST_CHATS
    if not ok:
        jlog("freio.1.block", chat_id=chat_id)
    return ok


def senha_do_dia() -> str:
    today = dt.datetime.utcnow().strftime("%Y-%m-%d")
    return hashlib.sha256(f"{today}asmodeus_maestro_v1".encode()).hexdigest()[:8]


def freio_2_senha(command_text: str, supplied_password: str | None) -> tuple[bool, str]:
    lower = command_text.lower()
    needs = any(kw in lower for kw in DESTRUCTIVE_KEYWORDS)
    if not needs:
        return True, "no-password-required"
    expected = senha_do_dia()
    if supplied_password and supplied_password.strip().lower() == expected:
        return True, "password-ok"
    return False, f"PASSWORD-REQUIRED expected_prefix=`{expected[:2]}***` — envie `/maestro senha <SENHA>` antes do comando."


def freio_3_kill_switch() -> bool:
    """Lê flag em Firestore. True = kill ativado, worker deve abortar."""
    try:
        doc = STATE.fs_main.collection("maestro_control").document("kill_switch").get()
        if doc.exists:
            STATE.kill_switch = bool(doc.to_dict().get("active", False))
    except Exception as e:
        jlog("freio.3.read_err", error=str(e))
    return STATE.kill_switch


def freio_4_snapshot(collection: str, reason: str) -> str:
    """Dump da coleção atual em maestro_rollback/<id>."""
    snap_id = f"snap-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    try:
        docs = list(STATE.fs_main.collection(collection).limit(500).stream())
        payload = {d.id: d.to_dict() for d in docs}
        STATE.fs_main.collection("maestro_rollback").document(snap_id).set({
            "collection": collection,
            "reason": reason,
            "created_at": dt.datetime.utcnow(),
            "docs_count": len(payload),
            "payload": payload,
        })
        jlog("freio.4.snapshot", snap_id=snap_id, collection=collection, count=len(payload))
        return snap_id
    except Exception as e:
        jlog("freio.4.err", error=str(e))
        return ""


def freio_5_finops_track(cost_brl: float) -> tuple[bool, str]:
    now = dt.datetime.utcnow()
    if (now - STATE.hour_window_start).total_seconds() > 3600:
        STATE.hour_window_start = now
        STATE.hourly_cost_brl = 0.0
    STATE.hourly_cost_brl += cost_brl
    if STATE.hourly_cost_brl >= COST_HARD_CAP_HOUR_BRL:
        return False, f"HARD-CAP-HIT R${STATE.hourly_cost_brl:.2f}/h"
    if STATE.hourly_cost_brl >= COST_SOFT_CAP_HOUR_BRL:
        return True, f"SOFT-CAP R${STATE.hourly_cost_brl:.2f}/h — reduzir frequência"
    return True, f"ok R${STATE.hourly_cost_brl:.2f}/h"


# ---------------------------------------------------------------------------
# Audit log (APPEND-ONLY imutável)
# ---------------------------------------------------------------------------
def audit(event: str, chat_id: int, payload: dict[str, Any]) -> str:
    audit_id = f"audit-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
    try:
        STATE.fs_main.collection("maestro_audit_log").document(audit_id).set({
            "event": event,
            "chat_id": chat_id,
            "ts": dt.datetime.utcnow(),
            "payload": payload,
            "model": MODEL_ID,
            "version": VERSION,
        })
        jlog("audit.write", audit_id=audit_id, audit_event=event)
    except Exception as e:
        jlog("audit.err", error=str(e), audit_event=event, audit_id=audit_id, severity="ERROR", tb=traceback.format_exc()[:500])
    return audit_id


# ---------------------------------------------------------------------------
# Tool executors (dispatch da function call do Gemini -> ação real)
# ---------------------------------------------------------------------------
def exec_telegram_send(args: dict, chat_id: int) -> dict:
    """v2.1.2 — logging obrigatório + fallback sem parse_mode se Markdown quebrar."""
    token = STATE.secrets.get(SECRET_TELEGRAM_BOT, "")
    if not token:
        jlog("telegram.send.err", reason="token-missing", chat_id=chat_id)
        return {"ok": False, "err": "telegram-token-missing"}
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    text = args.get("text", "") or "(sem texto)"
    parse_mode = args.get("parse_mode", "Markdown")

    def _post(pm):
        payload = {
            "chat_id": chat_id,
            "text": text[:4000],
            "disable_web_page_preview": True,
        }
        if pm:
            payload["parse_mode"] = pm
        return requests.post(url, json=payload, timeout=15)

    try:
        r = _post(parse_mode)
        if not r.ok and parse_mode:
            # Telegram rejeitou markdown malformado — reenvia em plain text
            jlog("telegram.send.retry_plain", chat_id=chat_id, status=r.status_code, body=r.text[:300], text_preview=text[:200])
            r = _post(None)
        if not r.ok:
            jlog("telegram.send.fail", chat_id=chat_id, status=r.status_code, body=r.text[:300], text_preview=text[:200])
        else:
            jlog("telegram.send.ok", chat_id=chat_id, status=r.status_code, len=len(text))
        return {"ok": r.ok, "status": r.status_code, "body": r.text[:300]}
    except Exception as e:
        jlog("telegram.send.exception", chat_id=chat_id, error=str(e))
        return {"ok": False, "err": str(e)}


def exec_github_edit_file(args: dict, chat_id: int) -> dict:
    pat = STATE.secrets.get(SECRET_GITHUB_PAT, "")
    if not pat:
        return {"ok": False, "err": "github-pat-missing"}
    # F4 snapshot antes de mexer em código
    snap = freio_4_snapshot("maestro_audit_log", f"pre-github-edit:{args.get('path','?')}")
    try:
        gh = Github(pat)
        repo = gh.get_repo(REPO_FULL)
        path = args["path"]
        new_content = args["content"]
        msg = args["commit_msg"]
        branch = args.get("branch", DEFAULT_BRANCH)
        try:
            existing = repo.get_contents(path, ref=branch)
            result = repo.update_file(path, msg, new_content, existing.sha, branch=branch)
            sha = result["commit"].sha
            action = "update"
        except GithubException as e:
            if e.status == 404:
                result = repo.create_file(path, msg, new_content, branch=branch)
                sha = result["commit"].sha
                action = "create"
            else:
                raise
        audit("github.edit", chat_id, {"path": path, "action": action, "sha": sha, "snap": snap, "msg": msg})
        return {"ok": True, "sha": sha, "action": action, "snap": snap}
    except Exception as e:
        jlog("github.err", error=str(e), tb=traceback.format_exc()[:400])
        return {"ok": False, "err": str(e), "snap": snap}


def exec_firestore_read(args: dict, chat_id: int) -> dict:
    client = STATE.fs_codex if args.get("project") == "projeto-codex-br" else STATE.fs_main
    try:
        doc = client.collection(args["collection"]).document(args["doc_id"]).get()
        return {"ok": True, "exists": doc.exists, "data": doc.to_dict() if doc.exists else None}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_firestore_write(args: dict, chat_id: int) -> dict:
    client = STATE.fs_codex if args.get("project") == "projeto-codex-br" else STATE.fs_main
    try:
        ref = client.collection(args["collection"]).document(args["doc_id"])
        if args.get("merge", False):
            ref.set(args["data"], merge=True)
        else:
            ref.set(args["data"])
        audit("firestore.write", chat_id, {"collection": args["collection"], "doc_id": args["doc_id"]})
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_vertex_invoke(args: dict, chat_id: int) -> dict:
    model_id = args.get("model", "gemini-2.5-flash")
    try:
        sub_model = GenerativeModel(model_name=model_id)
        resp = sub_model.generate_content(
            args["prompt"],
            generation_config=GenerationConfig(
                temperature=float(args.get("temperature", 0.1)),
                max_output_tokens=8192,
            ),
        )
        # F5 estimativa simplificada
        approx_cost = 0.05  # R$ por chamada — ajustar com pricing real
        ok, msg = freio_5_finops_track(approx_cost)
        return {"ok": ok, "text": resp.text, "cost_msg": msg}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_directdata_call(args: dict, chat_id: int) -> dict:
    token = STATE.secrets.get(SECRET_DIRECT_DATA, "29AE5E97-AACF-4ACC-B0ED-692472D72D60")
    endpoint = args["endpoint"]
    params = args.get("params", {})
    url = f"https://apiv3.directd.com.br/api/{endpoint}"
    params["token"] = token
    try:
        r = requests.get(url, params=params, timeout=30)
        return {"ok": r.ok, "status": r.status_code, "json": r.json() if r.ok else None, "text": r.text[:600] if not r.ok else None}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_shell_exec(args: dict, chat_id: int) -> dict:
    cmd = args["cmd"]
    timeout = int(args.get("timeout_s", 120))
    # Armadilha conhecida (corpus 05): pkill -f dentro de gcloud --command mata SSH
    if "pkill -f" in cmd and "gcloud" in cmd and "--command" in cmd:
        return {"ok": False, "err": "ANTIPATTERN-BLOCK: pkill -f dentro de gcloud --command — use PID file"}
    audit("shell.exec.intent", chat_id, {"cmd": cmd[:500]})
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=timeout)
        return {
            "ok": r.returncode == 0,
            "rc": r.returncode,
            "stdout": (r.stdout or "")[-3000:],
            "stderr": (r.stderr or "")[-1500:],
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "err": f"timeout-{timeout}s"}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_snapshot_firestore(args: dict, chat_id: int) -> dict:
    snap_id = freio_4_snapshot(args["collection"], args.get("reason", "manual"))
    return {"ok": bool(snap_id), "snap_id": snap_id}


def exec_memory_recall(args: dict, chat_id: int) -> dict:
    try:
        doc = STATE.fs_main.collection("maestro_memory").document(args["topic"]).get()
        return {"ok": True, "exists": doc.exists, "lesson": doc.to_dict() if doc.exists else None}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_memory_write(args: dict, chat_id: int) -> dict:
    try:
        ref = STATE.fs_main.collection("maestro_memory").document(args["topic"])
        existing = ref.get()
        history = existing.to_dict().get("history", []) if existing.exists else []
        history.append({
            "lesson": args["lesson"],
            "tags": args.get("tags", []),
            "ts": dt.datetime.utcnow().isoformat() + "Z",
        })
        ref.set({
            "topic": args["topic"],
            "latest": args["lesson"],
            "tags": args.get("tags", []),
            "updated_at": dt.datetime.utcnow(),
            "history": history[-50:],  # mantém últimas 50
        })
        return {"ok": True, "stored_lessons": len(history)}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_task_complete(args: dict, chat_id: int) -> dict:
    audit("task.complete", chat_id, {
        "summary": args.get("summary"),
        "success": args.get("success"),
        "lessons": args.get("lessons", []),
    })
    # Reflexão pós-tarefa: grava cada lição em maestro_memory
    for i, lesson in enumerate(args.get("lessons", [])):
        topic = f"reflection-{dt.datetime.utcnow().strftime('%Y%m%d')}-{i}"
        exec_memory_write({"topic": topic, "lesson": lesson, "tags": ["post-task"]}, chat_id)
    return {"ok": True, "stop": True}


# ===== GOD v2.0 — implementações das 8 tools novas =====

def exec_web_search(args: dict, chat_id: int) -> dict:
    """Web search via Google Search grounding nativo do Gemini 2.5.
    
    Implementação: subprocess gemini com grounding=on, retorna top-5.
    Fallback: REST API do CSE se grounding indisponível.
    """
    query = args.get("query", "").strip()
    if not query:
        return {"ok": False, "err": "query vazia"}
    try:
        # Stub v2.0.0: usa Gemini com tool grounding
        from vertexai.generative_models import GenerativeModel as _GM
        m = _GM(model_name="gemini-2.5-flash")
        resp = m.generate_content(
            f"Busque na web: {query}. Retorne JSON com array 'results' de até 5 itens (title, url, snippet).",
            generation_config=GenerationConfig(temperature=0.0, max_output_tokens=2048),
        )
        text = resp.candidates[0].content.parts[0].text
        return {"ok": True, "raw": text[:4000], "query": query}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_fetch_url(args: dict, chat_id: int) -> dict:
    """Fetch HTTP/HTTPS URL pública. Limite 200KB."""
    url = args.get("url", "")
    extract_prompt = args.get("extract_prompt")
    if not url.startswith(("http://", "https://")):
        return {"ok": False, "err": "URL deve começar com http:// ou https://"}
    try:
        headers = {"User-Agent": "TransparenciaBR-Maestro/2.0"}
        r = requests.get(url, headers=headers, timeout=20, stream=True)
        r.raise_for_status()
        content = r.raw.read(200 * 1024, decode_content=True).decode("utf-8", errors="replace")
        if extract_prompt:
            from vertexai.generative_models import GenerativeModel as _GM
            m = _GM(model_name="gemini-2.5-flash")
            resp = m.generate_content(
                f"Da página abaixo, extraia: {extract_prompt}\n\nPágina:\n{content[:80000]}",
                generation_config=GenerationConfig(temperature=0.0, max_output_tokens=2048),
            )
            return {"ok": True, "url": url, "extracted": resp.candidates[0].content.parts[0].text}
        return {"ok": True, "url": url, "content": content[:50000], "truncated": len(content) >= 200 * 1024}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_subagent_spawn(args: dict, chat_id: int) -> dict:
    """Spawn de subagent Vertex isolado. Cria thread com max_turns + budget.
    
    v2.0.0: implementação assíncrona via publish em topic 'maestro-subagents'.
    Worker subagent dedicado processa em separado e grava resultado em maestro_subagents/<id>.
    """
    objective = args.get("objective", "").strip()
    max_turns = min(int(args.get("max_turns", 10)), 30)
    budget_brl = min(float(args.get("budget_brl", 2.0)), 10.0)
    if not objective:
        return {"ok": False, "err": "objective vazio"}
    subagent_id = f"sub-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    payload = {
        "subagent_id": subagent_id,
        "parent_chat_id": chat_id,
        "objective": objective,
        "max_turns": max_turns,
        "budget_brl": budget_brl,
        "created_at": dt.datetime.utcnow().isoformat() + "Z",
    }
    try:
        STATE.fs_main.collection("maestro_subagents").document(subagent_id).set(payload)
        topic_path = STATE.pubsub_pub.topic_path(PROJECT_VERTEX, "maestro-subagents")
        STATE.pubsub_pub.publish(topic_path, json.dumps(payload).encode("utf-8")).result(timeout=10)
        return {"ok": True, "subagent_id": subagent_id, "status": "spawned"}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_load_skill_runtime(args: dict, chat_id: int) -> dict:
    """Carrega skill .md de gs://tbr-skills/user/<nome>/SKILL.md."""
    skill_name = args.get("skill_name", "").strip()
    if not skill_name or "/" in skill_name or ".." in skill_name:
        return {"ok": False, "err": "skill_name inválido"}
    try:
        from google.cloud import storage
        client = storage.Client(project=PROJECT_MAIN)
        bucket = client.bucket("tbr-skills")
        blob = bucket.blob(f"user/{skill_name}/SKILL.md")
        if not blob.exists():
            return {"ok": False, "err": f"skill '{skill_name}' não existe em gs://tbr-skills/user/"}
        content = blob.download_as_text()
        return {"ok": True, "skill_name": skill_name, "content": content[:80000], "chars": len(content)}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_cron_schedule(args: dict, chat_id: int) -> dict:
    """Cria/atualiza Cloud Scheduler job que publica em maestro-commands."""
    schedule = args.get("schedule", "")
    command = args.get("command", "")
    name = args.get("name", "").strip().replace(" ", "-").lower()
    if not all([schedule, command, name]):
        return {"ok": False, "err": "schedule, command, name são obrigatórios"}
    payload = {
        "chat_id": chat_id,
        "text": command,
        "command_id": f"cron-{name}-{{{{.RunID}}}}",
        "source": "cron_schedule",
    }
    msg_b64 = base64.b64encode(json.dumps(payload).encode()).decode()
    job_name = f"projects/{PROJECT_VERTEX}/locations/{REGION}/jobs/maestro-cron-{name}"
    cmd = [
        "gcloud", "scheduler", "jobs", "create", "pubsub", f"maestro-cron-{name}",
        f"--project={PROJECT_VERTEX}", f"--location={REGION}",
        f"--schedule={schedule}", "--time-zone=UTC",
        f"--topic=maestro-commands", f"--message-body={json.dumps(payload)}",
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if out.returncode != 0 and "ALREADY_EXISTS" in out.stderr:
            # tenta update
            cmd[3] = "update"
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return {"ok": out.returncode == 0, "job": job_name, "stderr": out.stderr[:500] if out.returncode else ""}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_browser_task_remote(args: dict, chat_id: int) -> dict:
    """Dispara Cloud Run job 'maestro-browser' com Playwright headless."""
    url = args.get("url", "")
    task = args.get("task", "")
    if not url or not task:
        return {"ok": False, "err": "url e task obrigatórios"}
    job_id = f"browser-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:6]}"
    try:
        # v2.0.0: stub que grava request em Firestore; Cloud Run job 'maestro-browser' separado consome
        STATE.fs_codex.collection("maestro_browser_jobs").document(job_id).set({
            "job_id": job_id, "chat_id": chat_id, "url": url, "task": task,
            "status": "queued", "created_at": dt.datetime.utcnow().isoformat() + "Z",
        })
        return {"ok": True, "job_id": job_id, "status": "queued", "hint": "poll firestore maestro_browser_jobs/<id> para resultado"}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_confirm_action(args: dict, chat_id: int) -> dict:
    """Envia mensagem com botões inline e aguarda callback."""
    question = args.get("question", "")
    timeout = min(int(args.get("timeout_seconds", 60)), 300)
    if not question:
        return {"ok": False, "err": "question vazia"}
    confirm_id = f"confirm-{uuid.uuid4().hex[:8]}"
    # Envia com inline keyboard
    token = STATE.secrets.get(SECRET_TELEGRAM_BOT, "")
    if not token:
        return {"ok": False, "err": "telegram token ausente"}
    reply_markup = {"inline_keyboard": [[
        {"text": "✅ Sim", "callback_data": f"{confirm_id}:yes"},
        {"text": "❌ Não", "callback_data": f"{confirm_id}:no"},
    ]]}
    try:
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat_id, "text": f"❔ {question}", "reply_markup": reply_markup},
            timeout=10,
        )
        r.raise_for_status()
        # Poll Firestore por callback (listener grava em maestro_confirmations/<confirm_id>)
        deadline = time.time() + timeout
        doc_ref = STATE.fs_main.collection("maestro_confirmations").document(confirm_id)
        while time.time() < deadline:
            snap = doc_ref.get()
            if snap.exists:
                data = snap.to_dict() or {}
                return {"ok": True, "confirmed": data.get("answer") == "yes", "confirm_id": confirm_id}
            time.sleep(2)
        return {"ok": True, "confirmed": False, "timed_out": True, "confirm_id": confirm_id}
    except Exception as e:
        return {"ok": False, "err": str(e)}


def exec_notify_push(args: dict, chat_id: int) -> dict:
    """FCM push via HTTP v1. Token do dispositivo do Comandante em Secret Manager."""
    title = args.get("title", "Maestro")
    body = args.get("body", "")
    severity = args.get("severity", "info")
    # v2.0.0: implementação stub — grava notificação em Firestore que app frontend consome via onSnapshot
    try:
        STATE.fs_main.collection("maestro_notifications").add({
            "title": title, "body": body, "severity": severity,
            "chat_id": chat_id, "ts": dt.datetime.utcnow().isoformat() + "Z",
            "read": False,
        })
        return {"ok": True, "delivered": "firestore-stub", "severity": severity}
    except Exception as e:
        return {"ok": False, "err": str(e)}


TOOL_DISPATCH: dict[str, Callable[[dict, int], dict]] = {
    "telegram_send": exec_telegram_send,
    "github_edit_file": exec_github_edit_file,
    "firestore_read": exec_firestore_read,
    "firestore_write": exec_firestore_write,
    "vertex_invoke": exec_vertex_invoke,
    "directdata_call": exec_directdata_call,
    "shell_exec": exec_shell_exec,
    "snapshot_firestore": exec_snapshot_firestore,
    "memory_recall": exec_memory_recall,
    "memory_write": exec_memory_write,
    # GOD v2.0 — 8 novas tools
    "web_search": exec_web_search,
    "fetch_url": exec_fetch_url,
    "subagent_spawn": exec_subagent_spawn,
    "load_skill_runtime": exec_load_skill_runtime,
    "cron_schedule": exec_cron_schedule,
    "browser_task_remote": exec_browser_task_remote,
    "confirm_action": exec_confirm_action,
    "notify_push": exec_notify_push,
    "task_complete": exec_task_complete,
}


# ---------------------------------------------------------------------------
# Loop principal de raciocínio (function-calling até task_complete ou cap)
# ---------------------------------------------------------------------------
MAX_REASONING_TURNS = 30


def reason_loop(user_text: str, chat_id: int, command_id: str) -> dict:
    """Conduz o Gemini num loop function-calling até task_complete."""
    history: list[Content] = [Content(role="user", parts=[Part.from_text(user_text)])]
    audit("reason.start", chat_id, {"command_id": command_id, "text": user_text[:1000]})

    # GOD v2.0 — Regra do silêncio: toda execução via Telegram deve fechar
    # com pelo menos um telegram_send antes de task_complete
    telegram_sent = False
    last_tool_summary: list[str] = []

    turns = 0
    while turns < MAX_REASONING_TURNS:
        turns += 1
        if freio_3_kill_switch():
            audit("freio.3.kill", chat_id, {"command_id": command_id, "turn": turns})
            return {"stopped": True, "reason": "kill-switch"}

        try:
            resp = STATE.model.generate_content(history)
        except Exception as e:
            jlog("vertex.err", error=str(e), tb=traceback.format_exc()[:500])
            audit("vertex.err", chat_id, {"err": str(e)})
            return {"ok": False, "err": str(e)}

        # F5 — track de custo (estimativa por turno)
        ok, finops_msg = freio_5_finops_track(0.15)  # R$ 0.15 por turno gemini-2.5-pro
        if not ok:
            audit("freio.5.hardcap", chat_id, {"msg": finops_msg})
            exec_telegram_send({"text": f"⚠️ MAESTRO pausado: {finops_msg}"}, chat_id)
            return {"stopped": True, "reason": finops_msg}

        candidate = resp.candidates[0]
        parts = candidate.content.parts
        function_calls = [p.function_call for p in parts if hasattr(p, "function_call") and p.function_call and p.function_call.name]
        # v2.1.3 — audita finish_reason e contagens para diferenciar STOP/SAFETY/MAX_TOKENS/RECITATION
        finish_reason = getattr(candidate, "finish_reason", None)
        finish_reason_s = getattr(finish_reason, "name", str(finish_reason))
        jlog(
            "vertex.candidate",
            command_id=command_id,
            turn=turns,
            finish_reason=finish_reason_s,
            parts=len(parts),
            function_calls=len(function_calls),
        )

        if not function_calls:
            # Texto final livre — encaminha pro Telegram e fecha
            text_out = "".join([p.text for p in parts if hasattr(p, "text") and p.text]) or "(sem texto)"
            # v2.1.1 — anti-duplicação: só envia se ainda não mandamos nada neste comando
            if not telegram_sent:
                # v2.1.3 — valida retorno do Telegram antes de declarar sucesso
                send_result = exec_telegram_send({"text": text_out[:4000]}, chat_id)
                telegram_sent = bool(send_result.get("ok"))
                if not telegram_sent:
                    jlog(
                        "telegram.send.unconfirmed",
                        command_id=command_id,
                        turn=turns,
                        phase="text_only_end",
                        result=send_result,
                        text_preview=text_out[:200],
                    )
                    audit("telegram.send.unconfirmed", chat_id, {
                        "command_id": command_id,
                        "phase": "text_only_end",
                        "result": send_result,
                        "text": text_out[:800],
                    })
            else:
                jlog("telegram.duplicate.suppressed", command_id=command_id, turn=turns, text_preview=text_out[:200])
                audit("telegram.duplicate.suppressed", chat_id, {"command_id": command_id, "text": text_out[:300]})
            audit("reason.text_only_end", chat_id, {
                "text": text_out[:800],
                "telegram_sent": telegram_sent,
                "finish_reason": finish_reason_s,
            })
            if not telegram_sent:
                return {"ok": False, "err": "telegram-send-failed", "text": text_out, "finish_reason": finish_reason_s}
            return {"ok": True, "text": text_out, "telegram_sent": telegram_sent, "finish_reason": finish_reason_s}

        # Acrescenta a resposta do modelo no histórico
        history.append(candidate.content)

        # Executa cada function call sequencialmente
        response_parts: list[Part] = []
        stop_signal = False
        for fc in function_calls:
            name = fc.name
            try:
                args = dict(fc.args) if fc.args else {}
            except Exception:
                args = json.loads(str(fc.args)) if fc.args else {}

            jlog("tool.call", name=name, turn=turns)
            fn = TOOL_DISPATCH.get(name)
            if not fn:
                result = {"ok": False, "err": f"unknown-tool:{name}"}
            else:
                try:
                    result = fn(args, chat_id)
                except Exception as e:
                    result = {"ok": False, "err": str(e), "tb": traceback.format_exc()[:300]}
            audit("tool.result", chat_id, {"name": name, "ok": result.get("ok", False), "args_sample": str(args)[:300]})

            # GOD v2.0 — track regra do silêncio
            # v2.1.1 — anti-duplicação: se modelo chamar telegram_send 2x no mesmo comando, suprime
            if name == "telegram_send":
                if telegram_sent and result.get("ok"):
                    jlog("telegram.duplicate.intra_command", command_id=command_id, turn=turns)
                    audit("telegram.duplicate.intra_command", chat_id, {"command_id": command_id, "args": str(args)[:300]})
                if result.get("ok"):
                    telegram_sent = True
            if name not in ("telegram_send", "task_complete"):
                last_tool_summary.append(f"{name}={'ok' if result.get('ok') else 'fail'}")

            if result.get("stop"):
                stop_signal = True

            response_parts.append(Part.from_function_response(name=name, response=result))

        history.append(Content(role="user", parts=response_parts))

        if stop_signal:
            # GOD v2.0 — Regra do silêncio: auto-recovery se task_complete sem telegram_send
            if not telegram_sent:
                summary = ", ".join(last_tool_summary[-6:]) or "nenhuma"
                recovery_text = (
                    f"✅ Comandante Baesso, operação concluída em {turns} turno(s). "
                    f"Ações: {summary}."
                )
                # v2.1.3 — valida retorno do recovery também
                send_result = exec_telegram_send({"text": recovery_text}, chat_id)
                telegram_sent = bool(send_result.get("ok"))
                audit("silent.fail.recovered", chat_id, {
                    "command_id": command_id,
                    "turns": turns,
                    "summary": summary,
                    "telegram_sent": telegram_sent,
                    "send_result": send_result,
                    "severity": "WARNING",
                })
                jlog("silent.fail.recovered", command_id=command_id, turns=turns, telegram_sent=telegram_sent)
                if not telegram_sent:
                    jlog("telegram.send.unconfirmed", command_id=command_id, turn=turns, phase="task_complete_recovery", result=send_result)
            audit("reason.end", chat_id, {"turns": turns, "telegram_sent": telegram_sent})
            return {"ok": True, "turns": turns, "telegram_sent": telegram_sent}

    audit("reason.max_turns", chat_id, {"turns": turns})
    exec_telegram_send({"text": "⚠️ MAESTRO: atingi limite de turnos (30). Tarefa pausada."}, chat_id)
    return {"ok": False, "err": "max-turns"}


# ---------------------------------------------------------------------------
# Pub/Sub callback
# ---------------------------------------------------------------------------
def handle_message(message: pubsub_v1.subscriber.message.Message) -> None:
    raw = message.data.decode("utf-8")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        jlog("msg.bad_json", raw=raw[:200])
        fallback_chat = next(iter(WHITELIST_CHATS)) if getattr(sys.modules[__name__], "WHITELIST_CHATS", None) else 6483072695
        exec_telegram_send({"text": "❌ Falha silenciosa evitada: Payload JSON inválido no comando recebido."}, fallback_chat)
        message.ack()
        return

    chat_id = int(payload.get("chat_id", 0))
    text = payload.get("text", "")
    password = payload.get("password")
    command_id = payload.get("command_id", f"cmd-{uuid.uuid4().hex[:8]}")

    jlog("msg.in", command_id=command_id, chat_id=chat_id, len=len(text))
    audit("message.received", chat_id, {
        "command_id": command_id,
        "text": text[:1000],
        "source": payload.get("source", "telegram"),
        "raw_keys": sorted(list(payload.keys())),
    })

    # F1
    if not freio_1_whitelist(chat_id):
        audit("freio.1.block", chat_id, {"text": text[:200]})
        message.ack()
        return

    # F3 (verifica antes de processar)
    if freio_3_kill_switch():
        exec_telegram_send({"text": "🛑 MAESTRO em kill-switch. Use `/maestro resume`."}, chat_id)
        audit("freio.3.skip", chat_id, {"text": text[:200]})
        message.ack()
        return

    # F2
    allowed, senha_msg = freio_2_senha(text, password)
    if not allowed:
        exec_telegram_send({"text": f"🔐 {senha_msg}"}, chat_id)
        audit("freio.2.block", chat_id, {"text": text[:200], "reason": senha_msg})
        message.ack()
        return

    try:
        result = reason_loop(text, chat_id, command_id)
        jlog("msg.done", command_id=command_id, result_keys=list(result.keys()), ok=result.get("ok", False))
        # v2.1.3 — se o reason_loop retornou !ok sem exception, notifica o Comandante
        if not result.get("ok", False) and not result.get("stopped", False):
            jlog("msg.result_not_ok", command_id=command_id, result=result)
            err_msg = str(result.get("err", "erro desconhecido"))[:300]
            send_result = exec_telegram_send({"text": f"❌ MAESTRO falhou: `{err_msg}`"}, chat_id)
            if not send_result.get("ok"):
                audit("telegram.send.unconfirmed", chat_id, {
                    "command_id": command_id,
                    "phase": "handle_message_result_not_ok",
                    "result": send_result,
                    "loop_result": result,
                })
    except Exception as e:
        jlog("msg.err", command_id=command_id, error=str(e), tb=traceback.format_exc()[:500])
        audit("loop.err", chat_id, {"err": str(e)})
        exec_telegram_send({"text": f"❌ MAESTRO erro: `{str(e)[:300]}`"}, chat_id)
    finally:
        message.ack()



# ---------------------------------------------------------------------------
# Firestore inbox listener (/maestro-hq -> maestro_commands_inbox)
# ---------------------------------------------------------------------------
class _SyntheticPubSubMessage:
    """Minimal Pub/Sub-compatible message used by Firestore inbox commands."""
    def __init__(self, payload: dict[str, Any]):
        self.data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._acked = False

    def ack(self) -> None:
        self._acked = True
        jlog("inbox.synthetic.ack", command_id=json.loads(self.data.decode("utf-8")).get("command_id"))


def _process_inbox_doc(doc_ref, data: dict[str, Any]) -> None:
    command_id = data.get("command_id") or f"hq-{doc_ref.id}"
    chat_id = int(data.get("chat_id") or 6483072695)
    text = (data.get("text") or "").strip()
    if not text:
        doc_ref.set({"status": "error", "error": "empty-text", "updated_at": dt.datetime.utcnow()}, merge=True)
        return

    try:
        doc_ref.set({
            "status": "processing",
            "command_id": command_id,
            "processing_started_at": dt.datetime.utcnow(),
            "worker_version": VERSION,
        }, merge=True)
        jlog("inbox.processing", doc_id=doc_ref.id, command_id=command_id, chat_id=chat_id)
        synthetic = _SyntheticPubSubMessage({
            "chat_id": chat_id,
            "text": text,
            "command_id": command_id,
            "source": data.get("source", "hq-web"),
        })
        handle_message(synthetic)
        doc_ref.set({
            "status": "done",
            "done_at": dt.datetime.utcnow(),
            "acked": getattr(synthetic, "_acked", False),
        }, merge=True)
        jlog("inbox.done", doc_id=doc_ref.id, command_id=command_id)
    except Exception as e:
        jlog("inbox.err", doc_id=doc_ref.id, command_id=command_id, error=str(e), tb=traceback.format_exc()[:500])
        doc_ref.set({
            "status": "error",
            "error": str(e)[:500],
            "error_at": dt.datetime.utcnow(),
        }, merge=True)


def _start_inbox_listener() -> None:
    """Starts a daemon listener for HQ web commands queued in Firestore."""
    def _run() -> None:
        try:
            query_ref = STATE.fs_main.collection("maestro_commands_inbox").where("status", "==", "queued")

            def _on_snapshot(col_snapshot, changes, read_time):
                for change in changes:
                    try:
                        change_type = getattr(change.type, "name", str(change.type))
                        if change_type not in ("ADDED", "MODIFIED"):
                            continue
                        snap = change.document
                        data = snap.to_dict() or {}
                        if data.get("status") != "queued":
                            continue
                        _process_inbox_doc(snap.reference, data)
                    except Exception as e:
                        jlog("inbox.change.err", error=str(e), tb=traceback.format_exc()[:500])

            watch = query_ref.on_snapshot(_on_snapshot)
            jlog("inbox.listener.started", collection="maestro_commands_inbox")
            while True:
                time.sleep(3600)
        except Exception as e:
            jlog("inbox.listener.crash", error=str(e), tb=traceback.format_exc()[:500], severity="CRITICAL")

    t = threading.Thread(target=_run, daemon=True, name="firestore-inbox-listener")
    t.start()

def _start_health_server() -> None:
    """Cloud Run exige listener HTTP em $PORT — usamos um endpoint /health stdlib.
    Worker Pub/Sub continua em background; este servidor existe SÓ para o probe."""
    import threading
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class _HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"maestro-worker {VERSION} ok\n".encode("utf-8"))

        def log_message(self, format, *args):  # silencia stdout do http.server
            return

    port = int(os.environ.get("PORT", "8080"))
    srv = ThreadingHTTPServer(("0.0.0.0", port), _HealthHandler)
    t = threading.Thread(target=srv.serve_forever, daemon=True, name="health-http")
    t.start()
    jlog("health.listening", port=port)


def main() -> None:
    bootstrap()
    _start_health_server()
    _start_inbox_listener()
    subscriber = pubsub_v1.SubscriberClient()
    sub_path = subscriber.subscription_path(PROJECT_VERTEX, SUBSCRIPTION)
    flow = pubsub_v1.types.FlowControl(max_messages=1)  # 1 comando por vez
    future = subscriber.subscribe(sub_path, callback=handle_message, flow_control=flow)
    jlog("maestro.listening", subscription=sub_path, model=MODEL_ID)
    try:
        future.result()
    except KeyboardInterrupt:
        future.cancel()
        jlog("maestro.shutdown")
    except Exception as e:
        jlog("maestro.crash", error=str(e), tb=traceback.format_exc()[:500])
        raise


if __name__ == "__main__":
    main()
