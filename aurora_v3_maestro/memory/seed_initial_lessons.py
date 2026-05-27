#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Seed inicial das lições táticas no maestro_memory.
Carrega no Firestore TODOS os anti-padrões já catalogados em
corpus/05_padroes_aprendidos.md para o Maestro nascer com memória.

Rodar UMA vez logo após o primeiro deploy.
"""

from firestore_memory import MemoryStore

LESSONS = [
    # ---- Anti-padrões técnicos (custaram horas de debug) -------------------
    {
        "topic": "pkill-armadilha",
        "lesson": "NUNCA usar `pkill -f <nome_do_script>` dentro de `gcloud --command='...'` — o pattern bate no próprio command-line do gcloud e mata o SSH. Use PID file ou `pkill -f -U $USER` com filtros específicos.",
        "tags": ["vm", "gcloud", "ssh", "anti-pattern", "shell"],
    },
    {
        "topic": "glyph-render-pdf",
        "lesson": "O glyph `▸` (U+25B8) NÃO renderiza no Inter via ReportLab — aparece como quadradinho. Substituir por `›` (U+203A). Vale também para fontes DM Sans.",
        "tags": ["pdf", "reportlab", "fonts", "inter", "dm-sans"],
    },
    {
        "topic": "font-align-paraparser",
        "lesson": "`<font align=\"right\">` é inválido no paraparser do ReportLab — ignora silenciosamente. Use `ParagraphStyle(alignment=TA_RIGHT)` ao construir o estilo.",
        "tags": ["pdf", "reportlab", "paraparser", "anti-pattern"],
    },
    {
        "topic": "vm-worker-silent-fail",
        "lesson": "`try/except: pass` em worker rodando na VM grava 0 bytes silenciosamente. SEMPRE logar em `errors/<key>.err` antes de continuar — caso contrário o pipeline parece OK mas não produz nada.",
        "tags": ["vm", "python", "logging", "anti-pattern", "worker"],
    },
    {
        "topic": "bq-location-mismatch",
        "lesson": "Dataset `tbr_leads_prev` é `southamerica-east1`; dataset `transparenciabr` e `tbr_ceap` são `US`. Sempre passar location explícito no Pipedream. Erro de location não dá mensagem clara — só `Dataset not found`.",
        "tags": ["bigquery", "location", "tbr_leads_prev", "gcp"],
    },
    {
        "topic": "bq-accent-columns",
        "lesson": "Colunas BigQuery com acento (ex: `forma_filiação`) PRECISAM de backticks no SQL. Sem backtick → `Unrecognized name`.",
        "tags": ["bigquery", "sql", "acentos"],
    },
    {
        "topic": "ua-dados-gov",
        "lesson": "dados.gov.br retorna 403 para User-Agent genérico (curl/python-requests). Usar `TransparenciaBR-engines/1.0`.",
        "tags": ["http", "user-agent", "dados.gov.br", "crawler"],
    },
    {
        "topic": "tbr-reader-sa-comprometida",
        "lesson": "A chave da SA `tbr-reader@transparenciabr` ESTÁ COMPROMETIDA — vaza nos outputs do conector Pipedream `google_cloud-run-query`. NUNCA expor o output bruto desse conector em logs ou ao Comandante.",
        "tags": ["security", "service-account", "leak", "pipedream"],
    },
    {
        "topic": "directdata-endpoints-404",
        "lesson": "Endpoints Direct Data v3 que retornam 404 atualmente: QuadroSocietarioReceitaFederal, PGFNListaDevedores, ProtestosCenprot. Usar alternativas: BeneficiarioFinal (sócios), ReceitaFederalPessoaJuridica (cnpj), ProcessosJudiciaisSimplificada (litigância).",
        "tags": ["directdata", "endpoints", "404"],
    },

    # ---- Padrões editoriais do dossiê --------------------------------------
    {
        "topic": "padrao-7-layer",
        "lesson": "Padrão 'Alta Inteligência' = 7 layers por finding: (1) Header colorido por severidade, (2) Metadata strip [SEV | ID | EIXO], (3) Timeline bar com datas, (4) Key point em 1 frase com bullet ›, (5) Body analítico 3-5 parágrafos, (6) Contraditório box 3-partes (Versão Oficial / Análise Independente / Status), (7) Source citation box com URL primária clicável.",
        "tags": ["dossie", "pdf", "padrao-visual", "7-layer"],
    },
    {
        "topic": "contraditorio-3-partes",
        "lesson": "Findings ≥ MÉDIA exigem box de contraditório com 3 partes: 'Versão oficial / declaração do investigado' + 'Análise independente baseada em dados primários' + 'Status (pendente direito de resposta / respondido / sem resposta após 48h)'. Sem esse box, viola COMPLIANCE-004 e a lei TransparênciaBR §9.",
        "tags": ["dossie", "lgpd", "compliance", "contraditorio"],
    },
    {
        "topic": "tom-informativo-obrigatorio",
        "lesson": "Tom INFORMATIVO sempre. PROIBIDO em PDF/UI: 'fraude', 'roubou', 'corrupto', 'ladrão', 'prova de crime', 'desviou', 'fraudou', codinomes Asmodeus/Goetia/lobo mau. Substituir por 'padrão estatisticamente anômalo compatível com X', 'indício', 'risco elevado', 'evidência administrativa'.",
        "tags": ["tom", "lgpd", "compliance", "palavras-proibidas"],
    },
    {
        "topic": "cpf-mascaramento",
        "lesson": "CPF NUNCA em texto claro. PEP: mascarar `***.XXX.XXX-**`. Civis: bloquear com `[DADO PROTEGIDO POR LGPD]`. Logs: sempre `SHA256(cpf + 'asmodeus_v1')`.",
        "tags": ["lgpd", "cpf", "compliance"],
    },
    {
        "topic": "pricing-anchors-dossie",
        "lesson": "Cases-âncora pra justificar valor dos dossiês: (1) CPI Petrobras→Kroll 2015 R$ 1,068M; (2) Kroll Mozambique 2017 USD 2B; (3) FTI Indiana IEDC 10/2025 45 findings; (4) Kroll Brasil DD R$ 800-16k. Citar com URL primária no rodapé do dossiê.",
        "tags": ["pricing", "cases", "dossie", "ancoras"],
    },
    {
        "topic": "eixo-5-empresas-exclusivas",
        "lesson": "Eixo 5 do dossiê forense = empresas exclusivas do investigado + cruzamento com QSA de sócios via BeneficiarioFinal Direct Data. Foi o eixo que gerou findings mais pesados nos casos Erika Hilton e Kim Kataguiri.",
        "tags": ["dossie", "eixo-5", "directdata", "empresas"],
    },

    # ---- Operações / deploy ------------------------------------------------
    {
        "topic": "vertex-temperature-0.1",
        "lesson": "Engines forenses do projeto SEMPRE temperature=0.1 (regra 7 da lei). Determinístico, zero alucinação. JSON estruturado obrigatório como output, não prosa livre (regra 8).",
        "tags": ["vertex", "gemini", "temperature", "json"],
    },
    {
        "topic": "iap-ssh-vm",
        "lesson": "Acesso às VMs aurora-cacador-br e tbr-mainframe sempre via IAP: `gcloud compute ssh <vm> --zone=<zone> --tunnel-through-iap`. SSH direto está bloqueado por firewall.",
        "tags": ["vm", "iap", "ssh", "gcloud"],
    },
    {
        "topic": "credito-vertex-codex",
        "lesson": "Vertex roda em `projeto-codex-br` (R$ 5.952 créditos, expira 07/04/2027). Projeto principal `transparenciabr` (number 89728155070) hospeda Firestore/Pub-Sub/BigQuery. Cross-project billing via SA.",
        "tags": ["finops", "vertex", "projeto-codex-br", "credito"],
    },
]


def main() -> None:
    store = MemoryStore()
    for entry in LESSONS:
        r = store.write(entry["topic"], entry["lesson"], entry["tags"], source="seed-v1.0")
        print(f"  ✓ {entry['topic']}: {r}")
    print(f"\nTotal: {len(LESSONS)} lições seedadas em maestro_memory.")
    store.audit_append("memory.seed.done", {"count": len(LESSONS), "version": "1.0"})


if __name__ == "__main__":
    main()
