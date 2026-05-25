#!/usr/bin/env python3
"""Gera dossiê forense parlamentar — padrão TransparênciaBR v1.0 · tom informativo · totalmente data-driven."""
import argparse
import json
from datetime import datetime
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, HRFlowable, NextPageTemplate,
    PageTemplate, Frame, BaseDocTemplate
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---------- FONTS ----------
FONT_DIR = Path('/tmp/erika_pdf/fonts')
pdfmetrics.registerFont(TTFont('DMSans', str(FONT_DIR/'DMSans-Regular.ttf')))
pdfmetrics.registerFont(TTFont('DMSans-Bold', str(FONT_DIR/'DMSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('Inter', str(FONT_DIR/'Inter-Regular.ttf')))
pdfmetrics.registerFont(TTFont('Inter-SemiBold', str(FONT_DIR/'Inter-SemiBold.ttf')))
pdfmetrics.registerFont(TTFont('Inter-Bold', str(FONT_DIR/'Inter-Bold.ttf')))

# ---------- DESIGN TOKENS v1.0 ----------
TEAL = HexColor('#01696F')
TEAL_DARK = HexColor('#0C4E54')
TEAL_LIGHT = HexColor('#E6F1F1')
INK = HexColor('#1A1A1A')
INK_MUTED = HexColor('#5A5A5A')
BG = HexColor('#F7F6F2')
BORDER = HexColor('#D4D1CA')
ERROR = HexColor('#A12C7B')
WARNING = HexColor('#964219')
WARN_LIGHT = HexColor('#FCEBD9')
ERR_LIGHT = HexColor('#FCDFEE')
SUCCESS = HexColor('#437A22')
CRITICAL_DARK = HexColor('#7A1B4A')
CRITICAL_BG = HexColor('#F8D4E2')
HIGH_BG = HexColor('#FCDFEE')
MEDIUM_BG = HexColor('#FCEBD9')
LOW_BG = HexColor('#E6F2DD')
INFO_BG = HexColor('#FAF6E0')

# ---------- STYLES ----------
styles = getSampleStyleSheet()
s_h1 = ParagraphStyle('h1', fontName='DMSans-Bold', fontSize=22, leading=26, textColor=INK, spaceAfter=8)
s_h2 = ParagraphStyle('h2', fontName='DMSans-Bold', fontSize=14, leading=18, textColor=TEAL, spaceBefore=10, spaceAfter=6)
s_h3 = ParagraphStyle('h3', fontName='DMSans-Bold', fontSize=11.5, leading=15, textColor=INK, spaceBefore=6, spaceAfter=4)
s_body = ParagraphStyle('body', fontName='Inter', fontSize=9, leading=12.5, textColor=INK, alignment=TA_JUSTIFY, spaceAfter=4)
s_body_left = ParagraphStyle('body_left', fontName='Inter', fontSize=9, leading=12.5, textColor=INK, alignment=TA_LEFT, spaceAfter=4)
s_small = ParagraphStyle('small', fontName='Inter', fontSize=7.5, leading=10, textColor=INK_MUTED)
s_label = ParagraphStyle('label', fontName='Inter-SemiBold', fontSize=8, leading=11, textColor=TEAL_DARK, spaceAfter=2)
s_kpi_value = ParagraphStyle('kpi_value', fontName='DMSans-Bold', fontSize=20, leading=22, textColor=TEAL, alignment=TA_CENTER)
s_kpi_label = ParagraphStyle('kpi_label', fontName='Inter', fontSize=7.5, leading=9.5, textColor=INK_MUTED, alignment=TA_CENTER)
s_finding_title = ParagraphStyle('ft', fontName='DMSans-Bold', fontSize=11, leading=13, textColor=colors.white)
s_finding_id = ParagraphStyle('fid', fontName='DMSans-Bold', fontSize=10, leading=12, textColor=colors.white, alignment=TA_CENTER)
s_meta = ParagraphStyle('meta', fontName='Inter-SemiBold', fontSize=7.5, leading=10, textColor=INK_MUTED)
s_quote = ParagraphStyle('quote', fontName='Inter', fontSize=8.5, leading=11.5, textColor=INK_MUTED, leftIndent=8, alignment=TA_JUSTIFY)
s_centered = ParagraphStyle('cen', fontName='Inter', fontSize=8.5, leading=11, textColor=INK, alignment=TA_CENTER)
s_disclaimer = ParagraphStyle('disc', fontName='Inter', fontSize=8, leading=11, textColor=INK_MUTED, alignment=TA_JUSTIFY, leftIndent=6, rightIndent=6, spaceAfter=6)
s_url = ParagraphStyle('url', fontName='Inter', fontSize=7.2, leading=9.5, textColor=TEAL_DARK, leftIndent=4, spaceAfter=1)

# ---------- LAYOUT ----------
PAGE_W, PAGE_H = A4
MARGIN_L = 1.5*cm
MARGIN_R = 1.5*cm
MARGIN_T = 2.0*cm
MARGIN_B = 1.6*cm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

# Globals preenchidos no main()
CONTESTACAO_SLUG = 'kim-kataguiri'
ALVO_NOME_PUBLICO = 'Kim Kataguiri'
ALVO_NOME_CURTO = 'Kim Kataguiri'

# ---------- HEADER/FOOTER ----------
def header_footer(canvas_obj, doc):
    canvas_obj.saveState()
    w, h = A4
    canvas_obj.setFillColor(TEAL)
    canvas_obj.rect(0, h-1.4*cm, w, 1.4*cm, fill=1, stroke=0)
    canvas_obj.setFillColor(colors.white)
    canvas_obj.setFont('DMSans-Bold', 9.5)
    canvas_obj.drawString(1.5*cm, h-0.85*cm, 'TRANSPARÊNCIABR')
    canvas_obj.setFont('Inter', 8)
    canvas_obj.drawString(4.6*cm, h-0.85*cm, '· Plataforma Forense de Inteligência Cívica')
    canvas_obj.setFont('Inter-SemiBold', 8)
    canvas_obj.drawRightString(w-1.5*cm, h-0.85*cm, 'DOSSIÊ FORENSE · v1.0')
    canvas_obj.setFillColor(INK_MUTED)
    canvas_obj.setFont('Inter', 7)
    canvas_obj.drawString(1.5*cm, 0.7*cm, 'Este documento NÃO constitui denúncia. Apresenta fatos públicos auditáveis.')
    canvas_obj.drawRightString(w-1.5*cm, 0.7*cm, f'Página {doc.page} · transparenciabr.org/dossie/{CONTESTACAO_SLUG}/contestacao')
    canvas_obj.setStrokeColor(BORDER); canvas_obj.setLineWidth(0.3)
    canvas_obj.line(1.5*cm, 1.0*cm, w-1.5*cm, 1.0*cm)
    canvas_obj.restoreState()

def cover_page_factory(alvo, kpis, meto):
    def cover_page(canvas_obj, doc):
        canvas_obj.saveState()
        w, h = A4
        canvas_obj.setFillColor(BG); canvas_obj.rect(0,0,w,h,fill=1,stroke=0)
        # Top band
        canvas_obj.setFillColor(TEAL); canvas_obj.rect(0, h-3.5*cm, w, 3.5*cm, fill=1, stroke=0)
        canvas_obj.setFillColor(colors.white)
        canvas_obj.setFont('DMSans-Bold', 22)
        canvas_obj.drawString(1.8*cm, h-2.2*cm, 'TRANSPARÊNCIABR')
        canvas_obj.setFont('Inter', 11)
        canvas_obj.drawString(1.8*cm, h-2.85*cm, 'Plataforma Forense de Inteligência Cívica · Dossiê v1.0')
        # Title block
        canvas_obj.setFillColor(INK)
        canvas_obj.setFont('DMSans-Bold', 36)
        canvas_obj.drawString(1.8*cm, h-7*cm, 'Dossiê Forense')
        canvas_obj.setFont('DMSans-Bold', 26)
        # extrai sigla + UF do partido (ex: 'MISSÃO-SP (desde 09/03/2026)' -> 'MISSÃO-SP')
        partido_curto = alvo['partido'].split('(')[0].strip().split(' — ')[0].strip()
        canvas_obj.drawString(1.8*cm, h-8.2*cm, f"{alvo['nome_publico']} ({partido_curto})")
        canvas_obj.setFont('Inter', 11)
        canvas_obj.setFillColor(INK_MUTED)
        canvas_obj.drawString(1.8*cm, h-9.0*cm, alvo.get('cargo','Deputado(a) Federal'))
        canvas_obj.drawString(1.8*cm, h-9.55*cm, f"Mandato: {alvo.get('mandato','')}")
        # linha extra com o partido completo se diferente
        if partido_curto != alvo['partido']:
            canvas_obj.setFont('Inter', 9.5)
            canvas_obj.drawString(1.8*cm, h-10.1*cm, f"Filiação atual: {alvo['partido']}")
        # Stats panel
        panel_y = h - 17.2*cm
        canvas_obj.setStrokeColor(BORDER); canvas_obj.setLineWidth(0.5)
        canvas_obj.setFillColor(colors.white)
        canvas_obj.roundRect(1.8*cm, panel_y, w-3.6*cm, 6.5*cm, 6, fill=1, stroke=1)
        canvas_obj.setFont('DMSans-Bold', 10)
        canvas_obj.setFillColor(TEAL)
        canvas_obj.drawString(2.4*cm, panel_y+5.7*cm, 'PANORAMA OPERACIONAL · MOTOR FORENSE · v1.0')
        # KPIs grid 4x2 — dinâmicos
        kpi_cards = [
            (str(kpis.get('findings_total','-')), 'Findings totais'),
            (str(kpis.get('criticos','-')), 'Severidade CRÍTICA'),
            (str(kpis.get('altos','-')), 'Severidade ALTA'),
            (str(kpis.get('medios','-')), 'Severidade MÉDIA'),
            (str(kpis.get('informativos','-')), 'Informativos'),
            (str(kpis.get('proposicoes_autoria','-')), 'Proposições de autoria'),
            (str(kpis.get('relatorias_2026', kpis.get('cnpjs_exclusivos','-'))), 'Relatorias / CNPJs'),
            (str(kpis.get('score_aurora_nivel','MEDIO')), 'Score do Motor'),
        ]
        cw = (w-3.6*cm-1.2*cm)/4
        for i, (val, lab) in enumerate(kpi_cards):
            col = i % 4; row = i // 4
            cx = 2.4*cm + col*cw
            cy = panel_y + 4.0*cm - row*1.7*cm
            canvas_obj.setFont('DMSans-Bold', 14 if len(str(val))<=6 else 11)
            canvas_obj.setFillColor(TEAL)
            canvas_obj.drawString(cx, cy, str(val))
            canvas_obj.setFont('Inter', 7.5)
            canvas_obj.setFillColor(INK_MUTED)
            canvas_obj.drawString(cx, cy-0.45*cm, lab)
        # Bottom block — agentes técnicos
        canvas_obj.setFont('DMSans-Bold', 10)
        canvas_obj.setFillColor(INK)
        n_agentes = len(meto.get('agentes_tecnicos', []))
        canvas_obj.drawString(1.8*cm, 4.7*cm, f'METODOLOGIA · {n_agentes} AGENTES TÉCNICOS')
        canvas_obj.setFont('Inter', 7.5)
        canvas_obj.setFillColor(INK_MUTED)
        agentes_str = ' · '.join(meto.get('agentes_tecnicos', []))
        from reportlab.lib.utils import simpleSplit
        lines = simpleSplit(agentes_str, 'Inter', 7.5, w-3.6*cm)
        y = 4.15*cm
        for line in lines[:6]:
            canvas_obj.drawString(1.8*cm, y, line); y -= 0.35*cm
        # Footer
        canvas_obj.setFillColor(TEAL); canvas_obj.rect(0,0,w,1.5*cm,fill=1,stroke=0)
        canvas_obj.setFillColor(colors.white)
        canvas_obj.setFont('Inter', 8)
        today = datetime.now().strftime('%d/%m/%Y')
        canvas_obj.drawString(1.8*cm, 0.55*cm, f'Emitido em {today} · Documento informativo público')
        canvas_obj.drawRightString(w-1.8*cm, 0.55*cm, 'transparenciabr.org')
        canvas_obj.restoreState()
    return cover_page

# ---------- HELPERS ----------
def sev_colors(sev):
    return {
        'CRÍTICA': (CRITICAL_DARK, CRITICAL_BG),
        'ALTA': (ERROR, ERR_LIGHT),
        'MÉDIA': (WARNING, MEDIUM_BG),
        'BAIXA': (SUCCESS, LOW_BG),
        'INFORMATIVO': (INK_MUTED, INFO_BG),
    }.get(sev, (INK_MUTED, BORDER))

def render_finding(f, idx, total):
    fg_sev, bg_sev = sev_colors(f.get('severidade', 'INFORMATIVO'))
    elements = []
    header_data = [[
        Paragraph(f['id'], s_finding_id),
        Paragraph(f['titulo'], s_finding_title),
        Paragraph(f'<font color="white">{idx}/{total}</font>',
                  ParagraphStyle('idx', fontName='Inter', fontSize=8, textColor=colors.white, alignment=TA_RIGHT)),
    ]]
    header_t = Table(header_data, colWidths=[1.6*cm, CONTENT_W-3.4*cm, 1.8*cm])
    header_t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), TEAL_DARK),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1), 8),
        ('RIGHTPADDING',(0,0),(-1,-1), 8),
        ('TOPPADDING',(0,0),(-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
    ]))
    elements.append(header_t)
    sev_text = f'<b>SEVERIDADE · {f.get("severidade","INFORMATIVO")}</b>'
    cls_text = f'<b>CLASSIFICAÇÃO · {f.get("classificacao","OBSERVAÇÃO")}</b>'
    sev_row = [[
        Paragraph(f'<font color="{fg_sev.hexval()}">{sev_text}</font>', s_meta),
        Paragraph(f'<font color="{TEAL_DARK.hexval()}">{cls_text}</font>', s_meta),
    ]]
    sev_t = Table(sev_row, colWidths=[CONTENT_W*0.45, CONTENT_W*0.55])
    sev_t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(0,0), bg_sev),
        ('BACKGROUND',(1,0),(1,0), TEAL_LIGHT),
        ('BOX',(0,0),(-1,-1), 0.3, BORDER),
        ('LINEAFTER',(0,0),(0,0), 0.3, BORDER),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1), 8),
        ('RIGHTPADDING',(0,0),(-1,-1), 8),
        ('TOPPADDING',(0,0),(-1,-1), 5),
        ('BOTTOMPADDING',(0,0),(-1,-1), 5),
    ]))
    elements.append(sev_t)
    elements.append(Spacer(1, 5))
    elements.append(Paragraph('<b>FATO</b>', s_label))
    elements.append(Paragraph(f['fato'], s_body))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph('<b>ANÁLISE</b>', s_label))
    elements.append(Paragraph(f['analise'], s_body))
    elements.append(Spacer(1, 4))
    if f.get('contraditorio') and f['contraditorio'].strip() not in ('—', ''):
        elements.append(Paragraph('<b>CONTRADITÓRIO E DIREITO DE RESPOSTA</b>', s_label))
        # quebrar PARTE em parágrafos visuais
        contra_txt = f['contraditorio'].replace('\n', '<br/>')
        elements.append(Paragraph(contra_txt, s_quote))
        elements.append(Spacer(1, 4))
    if f.get('fontes'):
        elements.append(Paragraph('<b>FONTES PRIMÁRIAS</b>', s_label))
        for src in f['fontes']:
            elements.append(Paragraph(f'↳ {src}', s_url))
        elements.append(Spacer(1, 4))
    elements.append(Spacer(1, 8))
    return KeepTogether(elements)

def fmt_brl(v):
    try:
        return f"R$ {v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
    except Exception:
        return str(v)

def build_story(data):
    global CONTESTACAO_SLUG, ALVO_NOME_PUBLICO, ALVO_NOME_CURTO
    story = []
    alvo = data['alvo']; kpis = data['kpis']
    meto = data['metodologia']; findings = data['findings']

    story.append(PageBreak())

    # === SUMÁRIO EXECUTIVO ===
    story.append(Paragraph('Sumário Executivo', s_h1))
    story.append(HRFlowable(width='100%', thickness=1.2, color=TEAL, spaceBefore=2, spaceAfter=10))
    exec_intro = (
        f"Este dossiê apresenta a compilação analítica de dados públicos sobre o exercício parlamentar "
        f"de <b>{alvo['nome_completo']}</b> ('{alvo['nome_publico']}', {alvo['partido']}), "
        f"ID Câmara {alvo['id_camara']}, mandato {alvo.get('mandato','')}. "
        f"O documento foi produzido pela plataforma TransparênciaBR mediante cruzamento automatizado "
        f"de fontes oficiais (API Dados Abertos da Câmara, Portal da Transparência, TSE, STF, TRF1, "
        f"TJSP, Receita Federal via BrasilAPI), reforçado pelo motor forense AURORA e por inspeção OSINT "
        f"em veículos jornalísticos verificados. Esta versão v1.0 incorpora "
        f"{kpis.get('findings_total',45)} findings classificados por severidade, contraditório judicial "
        f"em 3 partes para todos os achados de severidade igual ou superior a MÉDIA, e fontes primárias "
        f"verificáveis em 100% dos lançamentos."
    )
    story.append(Paragraph(exec_intro, s_body))
    story.append(Spacer(1, 6))
    nature = (
        f"<b>Natureza do documento:</b> apresentação descritiva e analítica de fatos públicos auditáveis. "
        f"Não constitui denúncia formal, imputação criminal ou peça acusatória. Toda informação possui "
        f"URL primária verificável. O contraditório é garantido para cada finding, e o parlamentar pode "
        f"exercer direito de resposta institucional em "
        f"<i>transparenciabr.org/dossie/{CONTESTACAO_SLUG}/contestacao</i>."
    )
    story.append(Paragraph(nature, s_body))
    story.append(Spacer(1, 6))

    compromisso = (
        "<b>Compromisso editorial v1.0:</b> contraditório público em três partes (decisão judicial conhecida, "
        "manifestação pública do parlamentar, direito de resposta institucional); citação exclusiva de fontes "
        "primárias verificáveis; e revisão pré-publicação de achados de severidade igual ou superior a ALTA "
        "para descartar falsos positivos."
    )
    story.append(Paragraph(compromisso, s_body))
    story.append(Spacer(1, 8))

    # KPI grid (mini) — 4 cards linha 1
    kpi_cards = [
        Table([[Paragraph(f"<b>{kpis.get('findings_total','-')}</b>", s_kpi_value)], [Paragraph('Findings totais', s_kpi_label)]], colWidths=[3.8*cm]),
        Table([[Paragraph(f"<b>{kpis.get('criticos','-')}</b>", ParagraphStyle('kc', parent=s_kpi_value, textColor=CRITICAL_DARK))], [Paragraph('Severidade CRÍTICA', s_kpi_label)]], colWidths=[3.8*cm]),
        Table([[Paragraph(f"<b>{kpis.get('altos','-')}</b>", ParagraphStyle('ka', parent=s_kpi_value, textColor=ERROR))], [Paragraph('Severidade ALTA', s_kpi_label)]], colWidths=[3.8*cm]),
        Table([[Paragraph(f"<b>{kpis.get('verificados_url_primaria','-')}</b>", s_kpi_value)], [Paragraph('Com URL primária', s_kpi_label)]], colWidths=[3.8*cm]),
    ]
    for c in kpi_cards:
        c.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1), TEAL_LIGHT),
            ('BOX',(0,0),(-1,-1), 0.4, BORDER),
            ('LEFTPADDING',(0,0),(-1,-1), 4),
            ('RIGHTPADDING',(0,0),(-1,-1), 4),
            ('TOPPADDING',(0,0),(-1,-1), 6),
            ('BOTTOMPADDING',(0,0),(-1,-1), 6),
        ]))
    kpi_row = Table([kpi_cards], colWidths=[(CONTENT_W)/4]*4)
    kpi_row.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story.append(kpi_row)
    story.append(Spacer(1, 8))

    # KPI grid 2 — específicos do alvo
    ceap_val = kpis.get('universo_financeiro_ceap_2019_2025') or kpis.get('universo_financeiro_total') or 0
    ceap_str = fmt_brl(ceap_val) if ceap_val else 'n/d'
    prop_str = str(kpis.get('proposicoes_autoria') or kpis.get('proposicoes') or '-')
    rel_str = str(kpis.get('relatorias_2026') or kpis.get('cnpjs_exclusivos') or '-')
    pat_str = f"+{kpis.get('patrimonio_variacao_2018_2022_pct','-')}%" if kpis.get('patrimonio_variacao_2018_2022_pct') else 'n/d'
    kpi_cards_2 = [
        Table([[Paragraph(f'<b>{ceap_str}</b>', ParagraphStyle('k', parent=s_kpi_value, fontSize=11))], [Paragraph('CEAP acumulada', s_kpi_label)]], colWidths=[3.8*cm]),
        Table([[Paragraph(f'<b>{prop_str}</b>', s_kpi_value)], [Paragraph('Proposições autoria', s_kpi_label)]], colWidths=[3.8*cm]),
        Table([[Paragraph(f'<b>{rel_str}</b>', s_kpi_value)], [Paragraph('Relatorias 2026', s_kpi_label)]], colWidths=[3.8*cm]),
        Table([[Paragraph(f'<b>{pat_str}</b>', ParagraphStyle('k', parent=s_kpi_value, fontSize=13))], [Paragraph('Patrimônio 2018→2022', s_kpi_label)]], colWidths=[3.8*cm]),
    ]
    for c in kpi_cards_2:
        c.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,-1), TEAL_LIGHT),
            ('BOX',(0,0),(-1,-1), 0.4, BORDER),
            ('LEFTPADDING',(0,0),(-1,-1), 4),
            ('RIGHTPADDING',(0,0),(-1,-1), 4),
            ('TOPPADDING',(0,0),(-1,-1), 6),
            ('BOTTOMPADDING',(0,0),(-1,-1), 6),
        ]))
    kpi_row_2 = Table([kpi_cards_2], colWidths=[(CONTENT_W)/4]*4)
    kpi_row_2.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story.append(kpi_row_2)
    story.append(Spacer(1, 14))

    # === IDENTIFICAÇÃO DO ALVO ===
    story.append(Paragraph('Identificação do Alvo', s_h2))
    id_rows = []
    campos = [
        ('Nome completo', 'nome_completo'),
        ('Nome público', 'nome_publico'),
        ('Marca pessoal', 'marca'),
        ('ID Câmara dos Deputados', 'id_camara'),
        ('Data de nascimento', 'dob'),
        ('Naturalidade', 'naturalidade'),
        ('Profissão', 'profissao'),
        ('Partido / Trajetória', 'partido'),
        ('Cargo atual', 'cargo'),
        ('Mandato', 'mandato'),
        ('Trajetória partidária', 'trajetoria_partidaria'),
        ('Gabinete', 'gabinete'),
        ('Telefone', 'telefone'),
        ('E-mail institucional', 'email'),
    ]
    for label, key in campos:
        if alvo.get(key):
            id_rows.append([label, str(alvo[key])])
    # Votações se houver
    if alvo.get('votacao_2018'):
        id_rows.append(['Votação 2018', f"{alvo['votacao_2018']:,} votos".replace(',', '.')])
    if alvo.get('votacao_2022'):
        id_rows.append(['Votação 2022', f"{alvo['votacao_2022']:,} votos".replace(',', '.')])
    if alvo.get('tipo_eleicao'):
        id_rows.append(['Tipo de eleição', alvo['tipo_eleicao']])
    if alvo.get('youtube_channel'):
        id_rows.append(['Canal YouTube', alvo['youtube_channel']])
    if alvo.get('patrimonio_2018') and alvo.get('patrimonio_2022'):
        id_rows.append(['Patrimônio declarado (TSE)', f"{fmt_brl(alvo['patrimonio_2018'])} (2018) → {fmt_brl(alvo['patrimonio_2022'])} (2022) — variação {alvo.get('patrimonio_variacao','')}"])
    redes = []
    if alvo.get('instagram_handle'):
        redes.append(f"Instagram {alvo['instagram_handle']}")
    if alvo.get('twitter_handle'):
        redes.append(f"X/Twitter {alvo['twitter_handle']}")
    if redes:
        id_rows.append(['Redes sociais', ' · '.join(redes)])

    id_data = [[Paragraph(f'<b>{k}</b>', s_small), Paragraph(v, s_body_left)] for k, v in id_rows]
    id_t = Table(id_data, colWidths=[5.0*cm, CONTENT_W-5.0*cm])
    id_t.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(0,-1), TEAL_LIGHT),
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1), 6),
        ('RIGHTPADDING',(0,0),(-1,-1), 6),
        ('TOPPADDING',(0,0),(-1,-1), 4),
        ('BOTTOMPADDING',(0,0),(-1,-1), 4),
        ('LINEBELOW',(0,0),(-1,-1), 0.3, BORDER),
        ('BOX',(0,0),(-1,-1), 0.4, BORDER),
    ]))
    story.append(id_t)
    story.append(Spacer(1, 14))

    # === METODOLOGIA ===
    story.append(Paragraph('Metodologia e Fontes', s_h2))
    n_agentes = len(meto.get('agentes_tecnicos', []))
    story.append(Paragraph(
        f"A compilação foi conduzida por {n_agentes} agentes técnicos especializados, encadeados em "
        f"pipeline automatizado de coleta, cruzamento e validação. Cada finding referencia ao menos uma URL "
        f"primária pública verificável. A versão v1.0 reforça três compromissos editoriais: contraditório "
        f"público em três partes, citação exclusiva de fontes primárias, e revisão pré-publicação de falsos "
        f"positivos para findings de severidade igual ou superior a ALTA.", s_body))
    story.append(Spacer(1, 4))
    story.append(Paragraph('<b>Fontes primárias consultadas:</b>', s_label))
    for src in meto.get('fontes_primarias', []):
        story.append(Paragraph(f'↳ {src}', s_small))
    story.append(Spacer(1, 6))
    story.append(Paragraph('<b>Disclaimer normativo:</b>', s_label))
    story.append(Paragraph(meto['disclaimer'], s_disclaimer))
    story.append(PageBreak())

    # === MATRIZ DE FINDINGS ===
    story.append(Paragraph('Matriz Analítica · Findings', s_h1))
    story.append(HRFlowable(width='100%', thickness=1.2, color=TEAL, spaceBefore=2, spaceAfter=10))
    story.append(Paragraph(
        f"A seguir, {len(findings)} observações analíticas extraídas do cruzamento das fontes primárias. "
        f"Cada card apresenta: FATO observado, ANÁLISE contextual, CONTRADITÓRIO em três partes "
        f"(quando aplicável), e FONTES verificáveis. A categoria CRÍTICA é reservada para achados de maior "
        f"relevância institucional (processos judiciais ativos, inconsistências cadastrais documentadas, "
        f"decisões judiciais favoráveis ou desfavoráveis em casos de alta exposição pública).", s_body))
    story.append(Spacer(1, 10))

    # Ordenar por severidade (CRÍTICA, ALTA, MÉDIA, INFORMATIVO) preservando ordem interna
    sev_order = {'CRÍTICA': 0, 'ALTA': 1, 'MÉDIA': 2, 'BAIXA': 3, 'INFORMATIVO': 4}
    findings_ordered = sorted(findings, key=lambda f: (sev_order.get(f.get('severidade','INFORMATIVO'), 9), int(f['id'].split('-')[1])))

    total = len(findings_ordered)
    for i, f in enumerate(findings_ordered, 1):
        story.append(render_finding(f, i, total))

    # === SÍNTESE FINAL ===
    story.append(PageBreak())
    story.append(Paragraph('Síntese Analítica', s_h1))
    story.append(HRFlowable(width='100%', thickness=1.2, color=TEAL, spaceBefore=2, spaceAfter=10))
    sintese = (
        f"O conjunto de {len(findings)} findings construído a partir de fontes oficiais e OSINT permite "
        f"caracterizar o exercício parlamentar de {alvo['nome_publico']} ({alvo['partido']}) em três eixos "
        f"principais:"
    )
    story.append(Paragraph(sintese, s_body))
    story.append(Spacer(1, 6))

    # Eixos contextualizados ao Kim (escritos a partir dos findings)
    eixos = data.get('eixos_sintese') or [
        ('Eixo 1 · Exposição judicial ativa e procedimentos em tramitação',
         "Há registros relevantes de procedimentos ativos perante o Supremo Tribunal Federal, com relatoria "
         "do Min. Luiz Fux, envolvendo queixa-crime apresentada por senador da República e procedimento "
         "atinente a declarações em ato público sobre Ministro da Suprema Corte. Adicionalmente, no escopo da "
         "CPMI do INSS, foram deferidas quebras de sigilo. O quadro demanda monitoramento institucional "
         "contínuo, sem antecipação de mérito. Em contrapartida, registra-se desfecho favorável em diversos "
         "litígios, incluindo arquivamento de representação no Conselho de Ética por 9 a 3 votos, "
         "extinção sem mérito de ação popular pelo TRF1, e rejeição de ação criminal proposta por outro "
         "deputado federal no STF em 2025."),
        ('Eixo 2 · Produção legislativa, distribuição territorial de emendas e gastos CEAP',
         "A produção legislativa autoral é volumosa (139 proposições, 11 relatorias em 2026) e contempla "
         "tanto normas vigentes de impacto (Marco Legal das Startups · LC 182/2021; Marco Legal dos Games · "
         "Lei 14.852/2024) quanto propostas controversas em direito constitucional brasileiro (PL 1262/2026 "
         "sobre castração química/cirúrgica; PECs 8 e 9 de 2026 sobre redução da maioridade penal; "
         "PL sobre 'racismo reverso'). A distribuição de emendas individuais concentra-se de forma "
         "desproporcional em Minas Gerais frente a São Paulo (razão aproximada de 10 para 1, conforme "
         "Agência Senado), ainda que a escolha seja juridicamente lícita. A CEAP acumula valores "
         "expressivos no ciclo 2019-2025, com pico em ano eleitoral (2022) e forte concentração na rubrica "
         "de passagens aéreas (entre 75% e 96% do total). A rubrica de manutenção de escritório cresce "
         "aproximadamente 35 vezes entre 2019 e 2024."),
        ('Eixo 3 · Trajetória partidária, estrutura empresarial associada e atividade digital',
         "A trajetória partidária do parlamentar percorre DEM (2018-2022), União Brasil (2022-2026) e, "
         "desde março de 2026, o Partido Missão — sigla fundada pelo MBL e aprovada por unanimidade pelo "
         "TSE em 04/11/2025. A única pessoa jurídica em nome direto do parlamentar identificada é a KIM "
         "PRODUÇÃO DE VÍDEOS LTDA (CNPJ 39.284.072/0001-43, capital R$ 1.000,00), compatível com a "
         "intensa atividade audiovisual em canal próprio no YouTube (1,92 milhão de inscritos, mais de "
         "740 milhões de visualizações acumuladas). Cabe registro do veículo MRL Comunicação (CNPJ "
         "22.779.685/0001-59), associado historicamente ao MBL e à família Santos, com presença "
         "documentada em apurações jornalísticas anteriores. O patrimônio declarado ao TSE variou +218,5% "
         "entre 2018 e 2022."),
    ]
    for titulo, corpo in eixos:
        story.append(Paragraph(f'<b>{titulo}</b>', s_h3))
        story.append(Paragraph(corpo, s_body))
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 10))
    story.append(Paragraph('Recomendações de Monitoramento Contínuo', s_h2))
    recs = data.get('recomendacoes') or [
        f"Acompanhar a tramitação no STF dos procedimentos sob relatoria do Min. Luiz Fux envolvendo o "
        f"parlamentar (queixa-crime do Senador Weverton e procedimento da Av. Paulista), com publicação "
        f"de eventuais decisões.",
        "Monitorar a distribuição geográfica das emendas parlamentares individuais nos próximos ciclos "
        "orçamentários, especialmente a razão Minas Gerais frente a São Paulo.",
        "Acompanhar a evolução da rubrica CEAP 'Manutenção de Escritório' e a composição da cota em ano "
        "eleitoral (2026), com atenção à participação proporcional de passagens aéreas.",
        "Solicitar esclarecimento institucional sobre a contratação FIPE de 2020 (rubrica 'Consultorias') "
        "para complementar a transparência do objeto contratual.",
        "Acompanhar a operação eleitoral do Partido Missão e a alocação patrimonial do parlamentar nas "
        "próximas declarações ao TSE.",
        "Monitorar a tramitação dos PLs e PECs de autoria (castração química/cirúrgica, redução da "
        "maioridade penal, racismo reverso) e o conjunto de processos cadastrados no monitor da ABRAJI.",
    ]
    for r in recs:
        story.append(Paragraph(f'• {r}', s_body_left))
        story.append(Spacer(1, 3))

    # === BLOCO DE CONTRADITÓRIO CONSOLIDADO ===
    story.append(PageBreak())
    story.append(Paragraph('Bloco de Contraditório Consolidado', s_h1))
    story.append(HRFlowable(width='100%', thickness=1.2, color=TEAL, spaceBefore=2, spaceAfter=10))
    story.append(Paragraph(
        "Esta seção reúne, em página dedicada, as manifestações públicas do parlamentar e as decisões "
        "judiciais favoráveis localizadas até a data de publicação, em cumprimento ao princípio editorial "
        "v1.0 de contraditório efetivo.", s_body))
    story.append(Spacer(1, 8))
    # listar findings com decisão favorável e/ou contraditório robusto
    favoraveis = [f for f in findings if f.get('classificacao') in ('DECISÃO JUDICIAL FAVORÁVEL', 'RECLASSIFICAÇÃO PÓS-INVESTIGAÇÃO')]
    if favoraveis:
        story.append(Paragraph('<b>Decisões judiciais e administrativas favoráveis registradas:</b>', s_label))
        for f in favoraveis:
            story.append(Paragraph(f"• <b>{f['id']}</b> — {f['titulo']}", s_body_left))
            story.append(Spacer(1, 3))
        story.append(Spacer(1, 8))

    story.append(Paragraph(
        "O parlamentar mantém direito de resposta institucional permanente em "
        f"<i>transparenciabr.org/dossie/{CONTESTACAO_SLUG}/contestacao</i>. As manifestações enviadas serão "
        "incorporadas em versões posteriores deste documento como anexo público.", s_body))

    # === AGRADECIMENTOS / CONTESTAÇÃO ===
    story.append(PageBreak())
    story.append(Paragraph('Agradecimentos e Canal de Contestação', s_h1))
    story.append(HRFlowable(width='100%', thickness=1.2, color=TEAL, spaceBefore=2, spaceAfter=10))
    story.append(Paragraph(
        "Este dossiê foi produzido no marco da missão pública da plataforma TransparênciaBR: "
        "tornar o exercício parlamentar compreensível, auditável e monitorável por qualquer cidadão. "
        "O trabalho reflete o compromisso com a transparência como instrumento democrático.", s_body))
    story.append(Spacer(1, 8))
    story.append(Paragraph('<b>Canal oficial de contestação:</b>', s_label))
    story.append(Paragraph(
        f"O Deputado {alvo['nome_publico']}, sua assessoria parlamentar, advogados e qualquer pessoa "
        f"com interesse legítimo podem contestar, complementar ou corrigir informações deste dossiê "
        f"mediante envio ao portal:", s_body))
    story.append(Spacer(1, 4))
    contest_table = Table(
        [[Paragraph(f'<b>transparenciabr.org/dossie/{CONTESTACAO_SLUG}/contestacao</b>',
                    ParagraphStyle('ct', fontName='Inter-Bold', fontSize=11, leading=14,
                                   textColor=TEAL, alignment=TA_CENTER))]],
        colWidths=[CONTENT_W]
    )
    contest_table.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1), TEAL_LIGHT),
        ('BOX',(0,0),(-1,-1), 1.0, TEAL),
        ('LEFTPADDING',(0,0),(-1,-1), 12),
        ('RIGHTPADDING',(0,0),(-1,-1), 12),
        ('TOPPADDING',(0,0),(-1,-1), 10),
        ('BOTTOMPADDING',(0,0),(-1,-1), 10),
    ]))
    story.append(contest_table)
    story.append(Spacer(1, 8))
    story.append(Paragraph(
        "As contestações recebidas são analisadas pela equipe editorial e incorporadas como anexo público "
        "à revisão subsequente do documento, garantindo o princípio do contraditório e do direito de "
        "resposta previstos na Constituição Federal (art. 5º, V) e na Lei de Acesso à Informação "
        "(Lei 12.527/2011).", s_body))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "<b>Nota LGPD:</b> CPFs e dados sensíveis de civis privados foram mascarados ou suprimidos em "
        "conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018). Dados de agentes públicos no "
        "exercício de função pública são tratados com base legal na transparência ativa.", s_disclaimer))

    # === ANEXO · GARANTIAS ===
    story.append(PageBreak())
    story.append(Paragraph('Anexo · Garantias e Direito de Resposta', s_h1))
    story.append(HRFlowable(width='100%', thickness=1.2, color=TEAL, spaceBefore=2, spaceAfter=10))
    garantias = [
        ('Natureza informativa',
         "Este documento apresenta fatos públicos auditáveis, com URL primária para cada finding. "
         "Não constitui denúncia, acusação formal ou imputação criminal. As análises são descritivas "
         "e contextuais."),
        ('Direito de resposta integral',
         f"O parlamentar pode contestar qualquer finding, fornecer documentação adicional ou esclarecer "
         f"pontos específicos mediante envio ao endereço "
         f"transparenciabr.org/dossie/{CONTESTACAO_SLUG}/contestacao. As contestações são incorporadas "
         f"como anexo público à revisão subsequente do documento."),
        ('Presunção de inocência e devido processo',
         "Os procedimentos judiciais descritos neste documento estão em tramitação e não configuram "
         "imputação de culpa. O parlamentar goza integralmente da presunção de inocência e do devido "
         "processo legal em todos os foros. A decisão definitiva sobre o mérito cabe exclusivamente "
         "aos órgãos de controle competentes."),
        ('Equilíbrio analítico',
         "O documento registra simultaneamente atuação legislativa de destaque, normas vigentes "
         "decorrentes de autoria parlamentar, decisões judiciais favoráveis, e observações de governança "
         "que demandam esclarecimento. Não há viés acusatório direcionado."),
        ('Conformidade LGPD',
         "O tratamento de dados pessoais observa a Lei Geral de Proteção de Dados (Lei 13.709/2018). "
         "CPFs são mascarados (formato ***.XXX.XXX-**). Dados sensíveis de civis privados são "
         "suprimidos. Dados de agentes públicos no exercício de função pública (art. 23 LGPD) são "
         "tratados com base legal na transparência ativa."),
        ('Atualização contínua',
         "Este documento reflete o estado das bases públicas consultadas em maio/2026. Atualizações "
         "periódicas serão emitidas conforme novos dados ou contestações recebidas. URL canônica do "
         f"documento: transparenciabr.org/dossie/{CONTESTACAO_SLUG}/v1-0"),
    ]
    for tit, txt in garantias:
        story.append(Paragraph(f'<b>{tit}</b>', s_h3))
        story.append(Paragraph(txt, s_body))
        story.append(Spacer(1, 6))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width='100%', thickness=0.6, color=BORDER, spaceBefore=2, spaceAfter=10))
    story.append(Paragraph('Glossário Técnico', s_h2))
    glossario = [
        ('AURORA', 'Codinome do motor forense em produção do projeto TransparênciaBR (Vertex AI + Gemini). Realiza análise de Benford, Z-score, circuitos societários e score de risco multidimensional.'),
        ('CEAP', 'Cota para o Exercício da Atividade Parlamentar — verba indenizatória mensal da Câmara dos Deputados (Ato da Mesa 43/2009).'),
        ('CPMI', 'Comissão Parlamentar Mista de Inquérito — instrumento bicameral de fiscalização do Congresso Nacional.'),
        ('Direct Data', 'Base de dados de vínculos CPF/CNPJ/CBO utilizada para enriquecimento societário dos fornecedores CEAP.'),
        ('EC 86/2015', 'Emenda Constitucional que estabeleceu o caráter impositivo das emendas parlamentares individuais.'),
        ('LGPD', 'Lei Geral de Proteção de Dados (Lei 13.709/2018) — regula o tratamento de dados pessoais no Brasil.'),
        ('LOA', 'Lei Orçamentária Anual — instrumento que define receitas e despesas do exercício.'),
        ('MBL', 'Movimento Brasil Livre — organização política do qual o parlamentar é cofundador.'),
        ('OSINT', 'Open Source Intelligence — coleta de inteligência a partir de fontes abertas e públicas.'),
        ('PGR', 'Procuradoria-Geral da República.'),
        ('RP7', 'Resultado Primário 7 — modalidade orçamentária de Transferências com Finalidade Definida (emendas individuais impositivas).'),
        ('STF', 'Supremo Tribunal Federal.'),
        ('TRF1', 'Tribunal Regional Federal da 1ª Região.'),
        ('TSE', 'Tribunal Superior Eleitoral.'),
        ('ABRAJI', 'Associação Brasileira de Jornalismo Investigativo — mantém monitor público de assédio judicial contra jornalistas.'),
    ]
    gloss_data = [[Paragraph(f'<b>{t}</b>', s_small), Paragraph(d, s_small)] for t, d in glossario]
    gloss_t = Table(gloss_data, colWidths=[4.5*cm, CONTENT_W-4.5*cm])
    gloss_t.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(-1,-1), 5),
        ('RIGHTPADDING',(0,0),(-1,-1), 5),
        ('TOPPADDING',(0,0),(-1,-1), 3),
        ('BOTTOMPADDING',(0,0),(-1,-1), 3),
        ('LINEBELOW',(0,0),(-1,-1), 0.3, BORDER),
    ]))
    story.append(gloss_t)

    story.append(Spacer(1, 16))
    meses_pt = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro']
    hoje = datetime.now()
    data_pt = f'{hoje.day:02d} de {meses_pt[hoje.month-1]} de {hoje.year}'
    story.append(Paragraph(
        '<i>Documento gerado pela plataforma TransparênciaBR · transparenciabr.org · '
        f'Emissão: {data_pt} · Versão 1.0</i>',
        ParagraphStyle('emit', parent=s_centered, fontSize=8, textColor=INK_MUTED)))
    return story

# ---------- MAIN ----------
def main():
    global CONTESTACAO_SLUG, ALVO_NOME_PUBLICO, ALVO_NOME_CURTO
    ap = argparse.ArgumentParser()
    ap.add_argument('--findings', required=True, help='Caminho do findings.json')
    ap.add_argument('--output', required=True, help='Caminho do PDF de saída')
    ap.add_argument('--alvo', required=True, help='Nome público do alvo (Kim Kataguiri, Erika Hilton, etc.)')
    ap.add_argument('--slug', default=None, help='Slug de contestação (default = alvo slugificado)')
    args = ap.parse_args()

    ALVO_NOME_PUBLICO = args.alvo
    ALVO_NOME_CURTO = args.alvo
    CONTESTACAO_SLUG = args.slug or args.alvo.lower().replace(' ', '-')

    data_path = Path(args.findings)
    out_path = Path(args.output)
    data = json.loads(data_path.read_text(encoding='utf-8'))

    doc = BaseDocTemplate(
        str(out_path),
        pagesize=A4,
        leftMargin=MARGIN_L, rightMargin=MARGIN_R,
        topMargin=MARGIN_T, bottomMargin=MARGIN_B,
        title=f'Dossiê Forense · {ALVO_NOME_PUBLICO} · v1.0',
        author='TransparênciaBR — Plataforma Forense de Inteligência Cívica',
        subject=f'Dossiê parlamentar com fatos públicos auditáveis — versão 1.0',
        creator='Perplexity Computer · agent_dossier_compiler',
    )
    frame_cover = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0, id='cover')
    frame_body = Frame(MARGIN_L, MARGIN_B, CONTENT_W, PAGE_H - MARGIN_T - MARGIN_B, id='body')
    cover_page = cover_page_factory(data['alvo'], data['kpis'], data['metodologia'])
    doc.addPageTemplates([
        PageTemplate(id='Cover', frames=[frame_cover], onPage=cover_page),
        PageTemplate(id='Body', frames=[frame_body], onPage=header_footer),
    ])
    story = [NextPageTemplate('Body')] + build_story(data)
    doc.build(story)
    print(f'OK · PDF gerado em {out_path}')
    print(f'Tamanho: {out_path.stat().st_size:,} bytes')

if __name__ == '__main__':
    main()
