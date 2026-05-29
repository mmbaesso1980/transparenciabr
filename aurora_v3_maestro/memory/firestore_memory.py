#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAESTRO Memory Layer v1.0 — Firestore
=====================================

Camada de aprendizado tático do Maestro. Duas coleções:

  - `maestro_memory/<topic>`     -> lições reutilizáveis (anti-padrões, dicas, configs)
  - `maestro_audit_log/<id>`     -> APPEND-ONLY log imutável de toda ação

Pode ser importado pelo worker ou usado standalone via CLI:

  $ python firestore_memory.py recall pkill-armadilha
  $ python firestore_memory.py write glyph-render "Inter não renderiza ▸. Use ›." --tags pdf reportlab
  $ python firestore_memory.py audit 10
  $ python firestore_memory.py reflect "Caso Paulo Octávio — finalizei com 28 findings, eixo 5 puxou licitantes BMW"

A reflexão pós-tarefa quebra o texto em lições atômicas e grava cada uma com
topic auto-gerado a partir de hash + keywords. Isso garante recall semântico
posterior via fuzzy match em tags + topic.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import sys
import uuid
from dataclasses import dataclass
from typing import Any

from google.cloud import firestore


PROJECT_MAIN = os.getenv("MAESTRO_PROJECT_MAIN", "transparenciabr")
COL_MEMORY = "maestro_memory"
COL_AUDIT = "maestro_audit_log"


# ---------------------------------------------------------------------------
@dataclass
class MemoryStore:
    project: str = PROJECT_MAIN
    _client: firestore.Client | None = None

    @property
    def client(self) -> firestore.Client:
        if self._client is None:
            self._client = firestore.Client(project=self.project)
        return self._client

    # ----------------------------- WRITE -----------------------------------
    def write(self, topic: str, lesson: str, tags: list[str] | None = None,
              source: str = "manual") -> dict[str, Any]:
        ref = self.client.collection(COL_MEMORY).document(topic)
        snap = ref.get()
        history = snap.to_dict().get("history", []) if snap.exists else []
        entry = {
            "lesson": lesson,
            "tags": tags or [],
            "source": source,
            "ts": dt.datetime.utcnow().isoformat() + "Z",
        }
        history.append(entry)
        history = history[-50:]  # rolling window 50 lições
        ref.set({
            "topic": topic,
            "latest": lesson,
            "tags": sorted(set(tags or []) | set(snap.to_dict().get("tags", []) if snap.exists else [])),
            "updated_at": dt.datetime.utcnow(),
            "count": len(history),
            "history": history,
        })
        return {"ok": True, "topic": topic, "count": len(history)}

    # ----------------------------- READ ------------------------------------
    def recall(self, topic: str) -> dict[str, Any] | None:
        doc = self.client.collection(COL_MEMORY).document(topic).get()
        return doc.to_dict() if doc.exists else None

    def search_by_tag(self, tag: str, limit: int = 20) -> list[dict[str, Any]]:
        q = (self.client.collection(COL_MEMORY)
             .where("tags", "array_contains", tag)
             .order_by("updated_at", direction=firestore.Query.DESCENDING)
             .limit(limit))
        return [d.to_dict() for d in q.stream()]

    def list_recent(self, limit: int = 20) -> list[dict[str, Any]]:
        q = (self.client.collection(COL_MEMORY)
             .order_by("updated_at", direction=firestore.Query.DESCENDING)
             .limit(limit))
        return [d.to_dict() for d in q.stream()]

    # ----------------------------- AUDIT -----------------------------------
    def audit_recent(self, n: int = 10) -> list[dict[str, Any]]:
        q = (self.client.collection(COL_AUDIT)
             .order_by("ts", direction=firestore.Query.DESCENDING)
             .limit(n))
        return [{"id": d.id, **d.to_dict()} for d in q.stream()]

    def audit_append(self, event: str, payload: dict[str, Any], chat_id: int = 0) -> str:
        aid = f"audit-{dt.datetime.utcnow().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:8]}"
        self.client.collection(COL_AUDIT).document(aid).set({
            "event": event,
            "chat_id": chat_id,
            "ts": dt.datetime.utcnow(),
            "payload": payload,
        })
        return aid

    # ----------------------------- REFLECT ---------------------------------
    def reflect(self, summary: str, lessons: list[str] | None = None,
                case_tag: str | None = None) -> dict[str, Any]:
        """Reflexão pós-tarefa: extrai lições e grava cada uma com topic auto.

        - Se `lessons` foi passado, usa direto.
        - Caso contrário, faz split em frases e mantém as relevantes (>30 chars).
        """
        if lessons is None:
            sentences = [s.strip() for s in re.split(r"(?<=[\.\!\?])\s+", summary) if len(s.strip()) > 30]
            lessons = sentences[:10]
        stored: list[str] = []
        base_tags = ["reflection"]
        if case_tag:
            base_tags.append(case_tag)
        for i, lesson in enumerate(lessons):
            # Topic auto: primeiras 4 palavras + hash curto
            words = re.findall(r"\w+", lesson.lower())[:4]
            slug = "-".join(words)[:40] or "lesson"
            h = hashlib.sha1(lesson.encode()).hexdigest()[:6]
            topic = f"refl-{slug}-{h}"
            self.write(topic, lesson, tags=base_tags + words[:3], source="reflect")
            stored.append(topic)
        self.audit_append("reflect.done", {"stored": stored, "summary": summary[:500]})
        return {"ok": True, "stored": stored, "count": len(stored)}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _cli() -> None:
    p = argparse.ArgumentParser(prog="firestore_memory", description="MAESTRO memory CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    p_w = sub.add_parser("write")
    p_w.add_argument("topic")
    p_w.add_argument("lesson")
    p_w.add_argument("--tags", nargs="*", default=[])

    p_r = sub.add_parser("recall")
    p_r.add_argument("topic")

    p_t = sub.add_parser("tag")
    p_t.add_argument("tag")
    p_t.add_argument("--limit", type=int, default=20)

    p_l = sub.add_parser("list")
    p_l.add_argument("--limit", type=int, default=20)

    p_a = sub.add_parser("audit")
    p_a.add_argument("n", type=int, nargs="?", default=10)

    p_f = sub.add_parser("reflect")
    p_f.add_argument("summary")
    p_f.add_argument("--case")

    args = p.parse_args()
    store = MemoryStore()

    if args.cmd == "write":
        print(json.dumps(store.write(args.topic, args.lesson, args.tags, source="cli"), default=str, ensure_ascii=False, indent=2))
    elif args.cmd == "recall":
        r = store.recall(args.topic)
        print(json.dumps(r, default=str, ensure_ascii=False, indent=2) if r else "null")
    elif args.cmd == "tag":
        print(json.dumps(store.search_by_tag(args.tag, args.limit), default=str, ensure_ascii=False, indent=2))
    elif args.cmd == "list":
        print(json.dumps(store.list_recent(args.limit), default=str, ensure_ascii=False, indent=2))
    elif args.cmd == "audit":
        print(json.dumps(store.audit_recent(args.n), default=str, ensure_ascii=False, indent=2))
    elif args.cmd == "reflect":
        print(json.dumps(store.reflect(args.summary, case_tag=args.case), default=str, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _cli()
