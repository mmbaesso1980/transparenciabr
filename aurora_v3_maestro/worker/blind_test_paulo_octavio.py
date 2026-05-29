#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TESTE CEGO — MAESTRO v1.0 vs Dossiê Paulo Octávio v2.3
======================================================

Harness que roda o Maestro localmente (sem Pub/Sub, sem Telegram) com o MESMO
input que o agente humano-supervisionado recebeu para gerar o
`Dossie_Paulo_Octavio_v2-3_CEGO.pdf`. O Maestro produz seu próprio dossiê
"cego" e gravamos artefatos para comparação:

  - blind_test_paulo_octavio/maestro_findings.json     (saída JSON estruturada)
  - blind_test_paulo_octavio/maestro_dossie.md         (markdown narrativo)
  - blind_test_paulo_octavio/comparativo_v23_vs_maestro.md  (lado a lado)

A comparação NÃO julga "qual é melhor" automaticamente — apenas alinha eixos,
contagem de findings, severidades e fontes citadas. A decisão fica com o
Comandante.

Uso:
  $ cd /home/user/workspace/aurora_v3_maestro/worker
  $ python blind_test_paulo_octavio.py --dry-run      # sem chamar Vertex
  $ python blind_test_paulo_octavio.py --run-vertex   # queima crédito de verdade
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import sys
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "worker"))
sys.path.insert(0, str(ROOT / "memory"))

PROMPT_PATH = ROOT / "prompts" / "SYSTEM_PROMPT_v1.0.md"
PAULO_DIR = Path("/home/user/workspace/paulo_octavio")
OUT_DIR = Path("/home/user/workspace/aurora_v3_maestro/blind_test_paulo_octavio")
OUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Coleta do input EXATO usado no v2.3
# ---------------------------------------------------------------------------
def collect_input() -> dict[str, Any]:
    """Lê todos os insumos que o agente humano-supervisionado teve à mão."""
    bundle: dict[str, Any] = {
        "alvo": {
            "nome": "Paulo Octávio Alves Pereira",
            "cpf_mask": "***.621.631-**",
            "uf": "DF",
            "natureza": "Ex-governador / empresário — escopo DUE DILIGENCE (não-parlamentar ativo)",
        },
        "briefing_md": None,
        "directdata": {},
        "qsa": None,
        "rede_societaria": None,
        "audit_cnpjs": [],
        "parsed_dou": [],
    }

    briefing = PAULO_DIR / "BRIEFING_ARSENAL_EVISCERADOR_v2.md"
    if briefing.exists():
        bundle["briefing_md"] = briefing.read_text(encoding="utf-8")[:60000]

    # DirectData JSONs
    dd_dir = PAULO_DIR / "directdata"
    if dd_dir.exists():
        for p in sorted(dd_dir.glob("*.json")):
            try:
                bundle["directdata"][p.stem] = json.loads(p.read_text(encoding="utf-8"))
            except Exception as e:
                bundle["directdata"][p.stem] = {"_error": str(e)}

    # Rede / QSA
    for fname, key in [
        ("qsa_consolidado.json", "qsa"),
        ("rede_societaria_flat.json", "rede_societaria"),
        ("dd_consolidado_v2.json", "dd_consolidado"),
        ("findings_paulo_octavio.json", "findings_v1_referencia"),
    ]:
        f = PAULO_DIR / fname
        if f.exists():
            try:
                bundle[key] = json.loads(f.read_text(encoding="utf-8"))
            except Exception as e:
                bundle[key] = {"_error": str(e)}

    # DOU parseado
    dou_dir = PAULO_DIR / "parsed_dou"
    if dou_dir.exists():
        for p in sorted(dou_dir.glob("*.json")):
            try:
                bundle["parsed_dou"].append({
                    "file": p.name,
                    "data": json.loads(p.read_text(encoding="utf-8")),
                })
            except Exception as e:
                bundle["parsed_dou"].append({"file": p.name, "_error": str(e)})

    return bundle


# ---------------------------------------------------------------------------
# Prompt-comando "cego" — instrução de tarefa para o Maestro
# ---------------------------------------------------------------------------
BLIND_TASK_PROMPT = """\
Comandante Baesso pede DOSSIÊ FORENSE INFORMATIVO do alvo abaixo, escopo
DUE DILIGENCE PRO (não-parlamentar ativo — ex-governador DF, empresário).

Você está em MODO CEGO: NÃO viu o dossiê v2.3 produzido anteriormente pelo
agente humano-supervisionado. Sua saída será comparada com aquela versão.

OBJETIVO
========
Produzir JSON estruturado com:
  {
    "findings": [
       { "id", "eixo", "severidade" (CRITICA|ALTA|MEDIA|BAIXA),
         "titulo", "key_point", "body", "contraditorio" (apenas se >= MEDIA),
         "sources": [ { "label", "url" } ],
         "data_evento" (ISO) }
    ],
    "sumario_executivo",
    "metodologia_resumida",
    "limitacoes",
    "licoes_aprendidas_para_memoria": [ ... ]
  }

REGRAS INVIOLÁVEIS (já no system prompt — reforçando):
- Tom INFORMATIVO. PROIBIDO 'fraude', 'roubou', 'desviou', 'corrupto'.
- CPF mascarado: ***.XXX.XXX-**
- Contraditório 3-partes obrigatório em finding >= MEDIA
- URL primária verificável em CADA finding
- Sem mock, sem fake — só dados do INPUT fornecido + lições da memory
- 18-25 findings consolidados (não inflacionar)
- Classificação por eixo: 1-Patrimônio, 2-Contratos, 3-Empresas, 4-Judicial,
  5-Empresas exclusivas + cruzamento sócios, 6-OSINT, 7-Outros

INPUT COMPLETO (briefing + Direct Data + QSA + DOU + rede societária):
=====================================================================
{INPUT_BUNDLE}

Ao concluir, retorne EXCLUSIVAMENTE o JSON acima — sem prosa fora dele.
"""


# ---------------------------------------------------------------------------
def call_vertex(system_prompt: str, task_prompt: str, max_tokens: int = 32768) -> str:
    """Invoca Gemini 2.5 Pro em projeto-codex-br com o system prompt do Maestro."""
    import vertexai
    from vertexai.generative_models import GenerativeModel, GenerationConfig

    vertexai.init(project="projeto-codex-br", location="us-east1")
    model = GenerativeModel(
        model_name="gemini-2.5-pro",
        system_instruction=system_prompt,
    )
    resp = model.generate_content(
        task_prompt,
        generation_config=GenerationConfig(
            temperature=0.1,
            max_output_tokens=max_tokens,
            response_mime_type="application/json",
        ),
    )
    return resp.text


# ---------------------------------------------------------------------------
def parse_json_loose(raw: str) -> dict | None:
    """Tenta parsear JSON; se vier com prosa, extrai o primeiro bloco {...}."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start:end + 1])
            except Exception:
                return None
    return None


# ---------------------------------------------------------------------------
def comparativo(findings_maestro: list[dict], baseline_v23_findings: list[dict] | None) -> str:
    """Gera markdown de comparação alinhando eixos e severidades."""
    out = ["# Comparativo — MAESTRO (cego) vs Dossiê v2.3 humano-supervisionado",
           f"\n_gerado em {dt.datetime.utcnow().isoformat()}Z_\n"]

    def buckets(lst: list[dict]) -> dict[str, int]:
        b: dict[str, int] = {}
        for f in lst or []:
            k = f.get("severidade", "?").upper()
            b[k] = b.get(k, 0) + 1
        return b

    def by_eixo(lst: list[dict]) -> dict[str, int]:
        b: dict[str, int] = {}
        for f in lst or []:
            k = str(f.get("eixo", "?"))
            b[k] = b.get(k, 0) + 1
        return b

    out.append("## Contagem total\n")
    out.append(f"- MAESTRO (cego): **{len(findings_maestro)}** findings")
    out.append(f"- Dossiê v2.3 (humano): **{len(baseline_v23_findings or [])}** findings\n")

    out.append("## Por severidade\n")
    out.append(f"- MAESTRO: `{buckets(findings_maestro)}`")
    out.append(f"- v2.3:    `{buckets(baseline_v23_findings or [])}`\n")

    out.append("## Por eixo\n")
    out.append(f"- MAESTRO: `{by_eixo(findings_maestro)}`")
    out.append(f"- v2.3:    `{by_eixo(baseline_v23_findings or [])}`\n")

    out.append("## Títulos MAESTRO (cego)\n")
    for f in findings_maestro:
        out.append(f"- [{f.get('severidade','?')}] {f.get('titulo','(sem título)')}")

    return "\n".join(out)


# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="Não chama Vertex")
    ap.add_argument("--run-vertex", action="store_true", help="Chama Vertex de verdade")
    ap.add_argument("--max-tokens", type=int, default=32768)
    args = ap.parse_args()

    if not PROMPT_PATH.exists():
        print(f"❌ SYSTEM_PROMPT não encontrado em {PROMPT_PATH}", file=sys.stderr)
        return 2

    system_prompt = PROMPT_PATH.read_text(encoding="utf-8")
    input_bundle = collect_input()

    # Sanitiza pra não explodir o context window — truncamos no JSON
    bundle_json = json.dumps(input_bundle, default=str, ensure_ascii=False)
    if len(bundle_json) > 700_000:
        # Trunca direct data se ficar gigante
        bundle_json = bundle_json[:700_000] + '..."<TRUNCATED-FOR-CONTEXT>"}'

    task_prompt = BLIND_TASK_PROMPT.replace("{INPUT_BUNDLE}", bundle_json)

    print(f"[blind-test] system prompt size: {len(system_prompt)} bytes")
    print(f"[blind-test] task prompt size:   {len(task_prompt)} bytes")
    print(f"[blind-test] input bundle keys:  {list(input_bundle.keys())}")
    print(f"[blind-test] OUT_DIR: {OUT_DIR}")

    (OUT_DIR / "input_bundle.json").write_text(bundle_json[:5_000_000], encoding="utf-8")
    (OUT_DIR / "task_prompt.md").write_text(task_prompt[:4_000_000], encoding="utf-8")

    if args.dry_run or not args.run_vertex:
        print("\n[blind-test] DRY-RUN — não chamei Vertex. Para queimar crédito:")
        print("  python blind_test_paulo_octavio.py --run-vertex")
        return 0

    print("[blind-test] chamando Vertex Gemini 2.5 Pro temp=0.1 ...")
    try:
        raw = call_vertex(system_prompt, task_prompt, max_tokens=args.max_tokens)
    except Exception as e:
        print(f"❌ vertex call failed: {e}\n{traceback.format_exc()}", file=sys.stderr)
        return 3

    (OUT_DIR / "maestro_raw.txt").write_text(raw, encoding="utf-8")
    parsed = parse_json_loose(raw)
    if not parsed:
        print("⚠️ JSON não parseável — output bruto em maestro_raw.txt", file=sys.stderr)
        return 4

    (OUT_DIR / "maestro_findings.json").write_text(
        json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")

    # Markdown narrativo
    md_lines = [
        f"# MAESTRO v1.0 — Dossiê Paulo Octávio (CEGO)",
        f"_temperature 0.1 · gemini-2.5-pro · {dt.datetime.utcnow().isoformat()}Z_\n",
        "## Sumário executivo\n",
        parsed.get("sumario_executivo", "(sem sumário)"),
        "\n## Metodologia\n",
        parsed.get("metodologia_resumida", "(sem)"),
        "\n## Limitações\n",
        parsed.get("limitacoes", "(sem)"),
        "\n## Findings\n",
    ]
    for f in parsed.get("findings", []):
        md_lines.append(f"\n### [{f.get('severidade','?')}] {f.get('titulo','')}")
        md_lines.append(f"*Eixo:* {f.get('eixo','?')} · *ID:* `{f.get('id','-')}` · *Data:* {f.get('data_evento','-')}")
        md_lines.append(f"\n**Key point:** {f.get('key_point','')}")
        md_lines.append(f"\n{f.get('body','')}")
        if f.get("contraditorio"):
            md_lines.append(f"\n**Contraditório:** {f['contraditorio']}")
        if f.get("sources"):
            md_lines.append("\n*Fontes:*")
            for s in f["sources"]:
                md_lines.append(f"- [{s.get('label','source')}]({s.get('url','')})")
    (OUT_DIR / "maestro_dossie.md").write_text("\n".join(md_lines), encoding="utf-8")

    # Comparativo
    baseline_path = PAULO_DIR / "findings_paulo_octavio_v2.json"
    baseline: list[dict] | None = None
    if baseline_path.exists():
        try:
            baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
            if isinstance(baseline, dict) and "findings" in baseline:
                baseline = baseline["findings"]
        except Exception:
            baseline = None

    comp_md = comparativo(parsed.get("findings", []), baseline)
    (OUT_DIR / "comparativo_v23_vs_maestro.md").write_text(comp_md, encoding="utf-8")

    print(f"\n✅ Maestro cego completou — artefatos em {OUT_DIR}")
    for f in OUT_DIR.iterdir():
        print(f"  - {f.name} ({f.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
