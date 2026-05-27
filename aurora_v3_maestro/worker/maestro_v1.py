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
            jlog("secret.loaded", key=key)
        except Exception as e:
            jlog("secret.miss", key=key, error=str(e))
            STATE.secrets[key] = ""

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
            "version": "1.0.0",
        })
        jlog("audit.write", audit_id=audit_id, event=event)
    except Exception as e:
        jlog("audit.err", error=str(e), event=event)
    return audit_id


# ---------------------------------------------------------------------------
# Tool executors (dispatch da function call do Gemini -> ação real)
# ---------------------------------------------------------------------------
def exec_telegram_send(args: dict, chat_id: int) -> dict:
    token = STATE.secrets.get(SECRET_TELEGRAM_BOT, "")
    if not token:
        return {"ok": False, "err": "telegram-token-missing"}
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": args.get("text", ""),
        "parse_mode": args.get("parse_mode", "Markdown"),
        "disable_web_page_preview": True,
    }
    try:
        r = requests.post(url, json=payload, timeout=15)
        return {"ok": r.ok, "status": r.status_code, "body": r.text[:300]}
    except Exception as e:
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
            "stdout": r.stdout[-3000:],
            "stderr": r.stderr[-1500:],
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

        if not function_calls:
            # Texto final livre — encaminha pro Telegram e fecha
            text_out = "".join([p.text for p in parts if hasattr(p, "text") and p.text]) or "(sem texto)"
            exec_telegram_send({"text": text_out[:4000]}, chat_id)
            audit("reason.text_only_end", chat_id, {"text": text_out[:800]})
            return {"ok": True, "text": text_out}

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

            if result.get("stop"):
                stop_signal = True

            response_parts.append(Part.from_function_response(name=name, response=result))

        history.append(Content(role="user", parts=response_parts))

        if stop_signal:
            audit("reason.end", chat_id, {"turns": turns})
            return {"ok": True, "turns": turns}

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
        message.ack()
        return

    chat_id = int(payload.get("chat_id", 0))
    text = payload.get("text", "")
    password = payload.get("password")
    command_id = payload.get("command_id", f"cmd-{uuid.uuid4().hex[:8]}")

    jlog("msg.in", command_id=command_id, chat_id=chat_id, len=len(text))

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
        jlog("msg.done", command_id=command_id, result_keys=list(result.keys()))
    except Exception as e:
        jlog("msg.err", command_id=command_id, error=str(e), tb=traceback.format_exc()[:500])
        audit("loop.err", chat_id, {"err": str(e)})
        exec_telegram_send({"text": f"❌ MAESTRO erro: `{str(e)[:300]}`"}, chat_id)
    finally:
        message.ack()


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
            self.wfile.write(b"maestro-worker v1.0 ok\n")

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
