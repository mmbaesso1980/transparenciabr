
# -*- coding: utf-8 -*-
import json
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.lib.units import inch
from reportlab.lib import colors

def gerar_pdf_pararraia():
    """Gera o PDF do dossiê do evento Pararraia a partir de um arquivo JSON."""
    
    try:
        with open('scripts/pararraia/dossie_data.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Erro: Arquivo 'dossie_data.json' não encontrado.")
        return

    doc = SimpleDocTemplate("Dossie_Pararraia.pdf", pagesize=(8.5 * inch, 11 * inch))
    styles = getSampleStyleSheet()
    
    # Estilos Customizados
    styles.add(ParagraphStyle(name='Center', alignment=TA_CENTER))
    styles.add(ParagraphStyle(name='Justify', alignment=TA_JUSTIFY))
    title_style = ParagraphStyle(name='TitleCustom', fontSize=18, leading=22, alignment=TA_CENTER, spaceAfter=20, textColor=colors.HexColor('#0C4E54'))
    header_style = ParagraphStyle(name='HeaderCustom', fontSize=10, textColor=colors.white, alignment=TA_CENTER)
    body_style = styles['Justify']
    body_style.fontSize = 11
    body_style.leading = 14

    story = []

    # Título
    story.append(Paragraph("Dossiê de Evento Público", title_style))
    story.append(Paragraph(data.get('evento', 'N/A'), styles['Center']))
    story.append(Spacer(1, 0.3 * inch))

    # Tabela de Fatos
    table_data = [
        [Paragraph('<b>Contratante</b>', header_style), Paragraph(data.get('contratante', 'N/A'), body_style)],
        [Paragraph('<b>Contratado</b>', header_style), Paragraph(data.get('contratado', 'N/A'), body_style)],
        [Paragraph('<b>Valor</b>', header_style), Paragraph(f"R$ {data.get('valor', '0,00')}", body_style)],
        [Paragraph('<b>Modalidade</b>', header_style), Paragraph(data.get('modalidade', 'N/A'), body_style)],
        [Paragraph('<b>Fundamentação Legal</b>', header_style), Paragraph(data.get('fundamentacao', 'N/A'), body_style)],
        [Paragraph('<b>Fonte Primária</b>', header_style), Paragraph(data.get('fonte', 'N/A'), body_style)],
    ]

    table = Table(table_data, colWidths=[2.5 * inch, 4.5 * inch])
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#01696F')), # Coluna de headers
        ('TEXTCOLOR', (0, 0), (0, -1), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('INNERGRID', (0, 0), (-1, -1), 0.25, colors.black),
        ('BOX', (0, 0), (-1, -1), 0.25, colors.black),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(Spacer(1, 0.5 * inch))

    # Disclaimer
    disclaimer = Paragraph(
        "<b>Disclaimer:</b> Este documento foi gerado de forma automatizada pelo Maestro v1.0, agente autônomo do projeto TransparênciaBR. As informações são compiladas a partir de fontes públicas e oficiais. A análise final e a interpretação dos dados são de responsabilidade do leitor.",
        body_style
    )
    story.append(disclaimer)

    doc.build(story)
    print("PDF 'Dossie_Pararraia.pdf' gerado com sucesso no diretório raiz.")

if __name__ == '__main__':
    gerar_pdf_pararraia()
