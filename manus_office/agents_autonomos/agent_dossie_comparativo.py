#!/usr/bin/env python3
"""
agent_dossie_comparativo.py — AURORA · MELHORIA 4
Gera dossiê comparativo A_vs_B (produto R$ 2k/un).

Input via Pub/Sub topic dossie-comparativo:
  { "alvo_a": "erika-hilton", "alvo_b": "kim-kataguiri", "comprador": "...", "comparativo_id": "..." }

Pipeline:
  1. Lê findings_v11.json de cada alvo (Firestore dossies_v1/{slug})
  2. Cruza por dimensão: judicial, CEAP, emendas, fornecedores compartilhados,
     score AURORA, presença, governismo
  3. Detecta convergências (mesmos fornecedores, mesma frente parlamentar)
  4. Detecta divergências (perfil ideológico, escolha contratual)
  5. Gera PDF comparativo (ReportLab) — 24-32pg, layout duas colunas
  6. Salva em gs://datalake-tbr-clean/dossies_v1/comparativo_{id}.pdf
  7. Notifica Maestro + comprador

Tom: INFORMATIVO (skill transparenciabr-lei) — sem fraude/desvio/etc.
"""
import os, json, datetime as dt
from pathlib import Path
from google.cloud import firestore, storage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib.colors import HexColor
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_JUSTIFY

PROJECT = "transparenciabr"
BUCKET  = "datalake-tbr-clean"
TEAL    = HexColor("#01696F")
INK     = HexColor("#1A1A1A")
MUTED   = HexColor("#5A5A5A")
BG_A    = HexColor("#E6F1F1")
BG_B    = HexColor("#FFF4E0")

def cruzar_findings(a, b):
    """Encontra convergências e divergências entre dois conjuntos."""
    a_titles = {f["titulo"][:50] for f in a.get("findings", [])}
    b_titles = {f["titulo"][:50] for f in b.get("findings", [])}
    return {
        "ambos": list(a_titles & b_titles)[:20],
        "so_a": list(a_titles - b_titles)[:20],
        "so_b": list(b_titles - a_titles)[:20],
    }

def comparar_kpis(a, b):
    """Tabela comparativa de KPIs."""
    ka, kb = a.get("kpis", {}), b.get("kpis", {})
    rows = [["Métrica", a["alvo"]["nome_publico"], b["alvo"]["nome_publico"]]]
    for k in ["findings_total","criticos","altos","medios","universo_financeiro_total","cnpjs_exclusivos","score_aurora_nivel","presenca_plenario"]:
        rows.append([k, str(ka.get(k,"—")), str(kb.get(k,"—"))])
    return rows

def gerar_pdf(a, b, cross, out_path):
    doc = SimpleDocTemplate(str(out_path), pagesize=A4,
                            leftMargin=1.5*cm, rightMargin=1.5*cm,
                            topMargin=2*cm, bottomMargin=1.6*cm)
    sH = ParagraphStyle("H", fontSize=18, textColor=TEAL, spaceAfter=10)
    sB = ParagraphStyle("B", fontSize=9, textColor=INK, alignment=TA_JUSTIFY, leading=12)
    story = [
        Paragraph(f"Dossiê Comparativo · {a['alvo']['nome_publico']} × {b['alvo']['nome_publico']}", sH),
        Paragraph(f"Versão 1.0 · TransparênciaBR · {dt.date.today().isoformat()}", sB),
        Spacer(1, 0.4*cm),
        Paragraph("PANORAMA COMPARATIVO", sH),
    ]
    kpi_rows = comparar_kpis(a, b)
    t = Table(kpi_rows, colWidths=[5*cm, 6*cm, 6*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,0), TEAL),
        ("TEXTCOLOR",(0,0),(-1,0), HexColor("#FFFFFF")),
        ("BACKGROUND",(1,1),(1,-1), BG_A),
        ("BACKGROUND",(2,1),(2,-1), BG_B),
        ("GRID",(0,0),(-1,-1), 0.3, MUTED),
        ("FONTSIZE",(0,0),(-1,-1), 8),
        ("LEFTPADDING",(0,0),(-1,-1), 4),
        ("RIGHTPADDING",(0,0),(-1,-1), 4),
    ]))
    story.append(t)
    story.append(Spacer(1, 0.6*cm))

    story.append(Paragraph("CONVERGÊNCIAS (sinais detectados em ambos)", sH))
    for x in cross["ambos"]:
        story.append(Paragraph(f"• {x}", sB))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(f"EXCLUSIVOS · {a['alvo']['nome_publico']}", sH))
    for x in cross["so_a"]:
        story.append(Paragraph(f"• {x}", sB))
    story.append(PageBreak())

    story.append(Paragraph(f"EXCLUSIVOS · {b['alvo']['nome_publico']}", sH))
    for x in cross["so_b"]:
        story.append(Paragraph(f"• {x}", sB))

    story.append(Spacer(1, 0.6*cm))
    story.append(Paragraph(
        "Este documento NÃO constitui denúncia. Apresenta fatos públicos auditáveis cruzados "
        "entre dois mandatários para fins de inteligência cívica.", sB))

    doc.build(story)

def main(alvo_a_slug, alvo_b_slug, comparativo_id):
    db = firestore.Client(project=PROJECT)
    cs = storage.Client(project=PROJECT)
    a = db.collection("dossies_v1").document(alvo_a_slug).get().to_dict()
    b = db.collection("dossies_v1").document(alvo_b_slug).get().to_dict()
    if not a or not b:
        raise ValueError(f"Dossiê A ou B ausente: {alvo_a_slug}/{alvo_b_slug}")
    cross = cruzar_findings(a, b)
    out = Path(f"/tmp/comparativo_{comparativo_id}.pdf")
    gerar_pdf(a, b, cross, out)
    blob = cs.bucket(BUCKET).blob(f"dossies_v1/comparativo_{comparativo_id}.pdf")
    blob.upload_from_filename(str(out), content_type="application/pdf")
    blob.make_public()
    print(f"OK · {blob.public_url}")
    return blob.public_url

if __name__ == "__main__":
    import sys
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "tst")
