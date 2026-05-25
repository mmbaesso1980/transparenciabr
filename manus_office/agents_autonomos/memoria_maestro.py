#!/usr/bin/env python3
"""
memoria_maestro.py — AURORA · MELHORIA 5
Memória persistente do Maestro — vira sócio que aprende.

Modelo:
  agents_graph/{node_id} = {
    type: 'fact' | 'decision' | 'preference' | 'pattern',
    content: str,                   # texto curto (até 200 chars)
    source: str,                    # 'chat' | 'dossie' | 'self_healer' | 'lead_hunter'
    created_at: ts,
    last_seen: ts,                  # bump em cada novo reforço
    weight: float,                  # 0-1, cresce com reforço
    related: [node_id],             # arestas para outros nós (cresce com cooccorrência)
    embedding: vector(768)          # textembedding-gecko-multilingual (Vertex)
  }

Operações:
  - remember(fact, source) — escreve nó novo OU bumpa weight de nó semanticamente próximo
  - recall(query, k=5) — busca por similaridade vector
  - reflect() — consolida pares com weight > 0.7 e cria 'pattern' inferido
  - prune() — descarta nós com weight < 0.1 e last_seen > 30 dias

Usado por:
  - maestroChat.js (cada turn chama recall antes do prompt)
  - cron diário: agent_memory_reflector roda reflect() + prune()
"""
import os, json, datetime as dt, hashlib
from google.cloud import firestore, aiplatform
import numpy as np

PROJECT = "transparenciabr"
LOCATION = "us-central1"
EMBED_MODEL = "textembedding-gecko-multilingual@latest"

def _embed(text: str):
    """Chama Vertex text embedding. Retorna vetor 768-d."""
    aiplatform.init(project=PROJECT, location=LOCATION)
    from vertexai.language_models import TextEmbeddingModel
    model = TextEmbeddingModel.from_pretrained(EMBED_MODEL)
    return model.get_embeddings([text])[0].values

def _cosine(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float(np.dot(a,b) / (np.linalg.norm(a)*np.linalg.norm(b) + 1e-9))

def remember(content: str, source: str = "chat", node_type: str = "fact"):
    """Persiste memória. Se já há nó próximo (>0.85 cos), bumpa weight em vez de duplicar."""
    db = firestore.Client(project=PROJECT)
    emb = _embed(content)
    # Buscar candidatos do mesmo type pelos 50 mais recentes
    qs = db.collection("agents_graph").where("type","==",node_type)\
            .order_by("last_seen", direction=firestore.Query.DESCENDING).limit(50).stream()
    best_id, best_sim = None, 0.0
    for d in qs:
        nd = d.to_dict()
        e2 = nd.get("embedding")
        if not e2: continue
        s = _cosine(emb, e2)
        if s > best_sim:
            best_sim, best_id = s, d.id
    now = dt.datetime.now(dt.timezone.utc)
    if best_id and best_sim > 0.85:
        ref = db.collection("agents_graph").document(best_id)
        snap = ref.get().to_dict()
        new_w = min(1.0, snap.get("weight", 0.3) + 0.1)
        ref.update({"weight": new_w, "last_seen": now, "reinforcements": firestore.Increment(1)})
        return {"action": "reinforced", "id": best_id, "weight": new_w}
    # Cria novo
    node_id = hashlib.sha1(f"{content}|{now.isoformat()}".encode()).hexdigest()[:20]
    db.collection("agents_graph").document(node_id).set({
        "type": node_type, "content": content[:200], "source": source,
        "embedding": emb, "weight": 0.3, "reinforcements": 1,
        "related": [], "created_at": now, "last_seen": now,
    })
    return {"action": "created", "id": node_id, "weight": 0.3}

def recall(query: str, k: int = 5, min_weight: float = 0.0):
    """Recupera k nós mais semelhantes à query."""
    db = firestore.Client(project=PROJECT)
    emb = _embed(query)
    qs = db.collection("agents_graph").where("weight",">=",min_weight)\
            .order_by("weight", direction=firestore.Query.DESCENDING).limit(200).stream()
    scored = []
    for d in qs:
        nd = d.to_dict()
        e2 = nd.get("embedding")
        if not e2: continue
        scored.append((_cosine(emb, e2), d.id, nd))
    scored.sort(reverse=True)
    return [{
        "id": i, "content": n["content"], "type": n["type"],
        "weight": n["weight"], "similarity": round(s,3),
    } for s, i, n in scored[:k]]

def reflect():
    """Cria nós 'pattern' agregando facts com weight alto."""
    db = firestore.Client(project=PROJECT)
    high = list(db.collection("agents_graph").where("type","==","fact")\
                  .where("weight",">",0.7).limit(50).stream())
    if len(high) < 3: return {"created_patterns": 0}
    # Agrupa por similaridade
    embs = [(d.id, d.to_dict()) for d in high]
    used = set()
    patterns = 0
    for i, (id1, n1) in enumerate(embs):
        if id1 in used: continue
        cluster = [n1["content"]]
        used.add(id1)
        for j in range(i+1, len(embs)):
            id2, n2 = embs[j]
            if id2 in used: continue
            if _cosine(n1["embedding"], n2["embedding"]) > 0.78:
                cluster.append(n2["content"])
                used.add(id2)
        if len(cluster) >= 3:
            patt = "PADRÃO: " + " | ".join(cluster[:3])
            remember(patt, source="reflect", node_type="pattern")
            patterns += 1
    return {"created_patterns": patterns}

def prune():
    """Remove nós fracos e velhos."""
    db = firestore.Client(project=PROJECT)
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)
    qs = db.collection("agents_graph").where("weight","<",0.1)\
            .where("last_seen","<",cutoff).limit(200).stream()
    n = 0
    batch = db.batch()
    for d in qs:
        batch.delete(d.reference); n += 1
        if n % 100 == 0:
            batch.commit(); batch = db.batch()
    batch.commit()
    return {"pruned": n}

if __name__ == "__main__":
    import sys
    op = sys.argv[1] if len(sys.argv) > 1 else "reflect"
    if op == "reflect": print(reflect())
    elif op == "prune": print(prune())
    elif op == "remember": print(remember(sys.argv[2], sys.argv[3] if len(sys.argv)>3 else "cli"))
    elif op == "recall": print(json.dumps(recall(sys.argv[2]), indent=2, default=str))
