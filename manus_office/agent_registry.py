"""
Registo dos 100 agentes — Meu Manus (estrutura operacional).

10 crews × 10 agentes + Maestro principal (não conta nos 100 de crew).
Skill externa não está no repo; esta tabela é a fonte única para o dashboard.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AgenteMeta:
    id: str
    nome: str
    avatar: str
    papel: str


@dataclass(frozen=True)
class CrewMeta:
    id: str
    nome: str
    emoji: str
    missao: str
    agentes: tuple[AgenteMeta, ...]


MAESTRO = AgenteMeta(
    id="maestro-001",
    nome="Maestro Supremo",
    avatar="🎖️",
    papel=(
        "Comandante da legião — escolhe autonomamente qual crew ativa face ao pedido, "
        "coordena prioridades, exige rigor factual e consolida entregas sem inventar dados. "
        "Usa pesquisa na web para validar contexto público e alinhar os 100 operadores com fontes atuais."
    ),
)

_CREW_TEMPLATES: list[tuple[str, str, str, str]] = [
    ("crew-forense", "Forense & CEAP", "🔬", "Auditoria de notas, Benford, fornecedores e risco CEAP."),
    ("crew-emendas", "Emendas & PIX", "💸", "Rastreio de emendas, beneficiários terminais e anomalias de repasse."),
    ("crew-pncp", "Contratos PNCP", "📑", "Dispensas, sobrepreço e vencedores recorrentes."),
    ("crew-patrimonio", "Patrimônio TSE", "🏛️", "Evolução patrimonial e outliers entre mandatos."),
    ("crew-gabinete", "Gabinete & Vínculos", "👥", "Parentesco, sócios e folha do gabinete."),
    ("crew-viagens", "Viagens & Pedágios", "🛣️", "Geolocalização de passagens e padrões anômalos."),
    ("crew-osint", "OSINT & Mídia", "📡", "Coleta aberta e cruzamento com registro oficial."),
    ("crew-risco", "Risco & Score", "⚠️", "Modelagem de risco e priorização de alvos."),
    ("crew-dossie", "Dossiê Executivo", "📋", "Consolidação narrativa e citação de fontes."),
    ("crew-deploy", "Engenharia & Entrega", "🛠️", "Especificação técnica e entrega de artefactos (sites, relatórios)."),
]

# Tótems visuais por posição (variação SOTA leve; um avatar por operador na UI).
_TOTENS: tuple[str, ...] = ("🐺", "🦉", "🦅", "🐉", "⚡", "🔮", "🛡️", "⚔️", "🗡️", "🏹")


def _build_crews() -> tuple[CrewMeta, ...]:
    out: list[CrewMeta] = []
    for crew_id, nome, emoji, missao in _CREW_TEMPLATES:
        agents: list[AgenteMeta] = []
        for i in range(1, 11):
            totem = _TOTENS[(i - 1) % len(_TOTENS)]
            agents.append(
                AgenteMeta(
                    id=f"{crew_id}-a{i:02d}",
                    nome=f"{nome.split()[0]} · Operador {i:02d}",
                    avatar=totem,
                    papel=(
                        f"Operador {i:02d} da crew «{nome}» — especialista tático; age com autonomia "
                        f"sob coordenação do Maestro. Foco: {missao} "
                        "Melhoria contínua: fundamenta cada missão com pesquisa na web quando faltarem fatos "
                        "ou precisares de contexto atualizado (fontes, jurisprudência, portais oficiais, notícias)."
                    ),
                )
            )
        out.append(CrewMeta(id=crew_id, nome=nome, emoji=emoji, missao=missao, agentes=tuple(agents)))
    return tuple(out)


CREWS: tuple[CrewMeta, ...] = _build_crews()


def crew_por_id(crew_id: str) -> CrewMeta | None:
    for c in CREWS:
        if c.id == crew_id:
            return c
    return None


def total_agentes_crews() -> int:
    return sum(len(c.agentes) for c in CREWS)


# =============================================================================
# APPEND-ONLY · AURORA Forensic v1.0 — 11ª crew (Dossiê Forense v1.0)
# =============================================================================
# Esta seção foi adicionada para a Entrega 1+2+3 do plano AURORA Forensic v1.0.
# Mantém intacta a estrutura original acima (10 crews + Maestro) e ADICIONA
# uma 11ª crew com 10 agentes 1:1 com os eixos da skill dossie_v1_0.md.
#
# Princípios v1.0 injetados nos `papel` (verbatim do Comandante Baesso):
#  9. Contraditório público obrigatório (3-partes: judicial + manifestação + DDR).
# 10. Fontes primárias no PDF — PROIBIDO citar BigQuery/vw_*/transparenciabr.*.
# 11. Revisão de falsos positivos pré-publicação (Scholar/Lattes/LinkedIn).
#
# Tom INFORMATIVO. Verbos PROIBIDOS: fraudou/desviou/roubou/corrupto.
# Sweet-spot: 40-55 findings com distribuição saudável.

_V1_PRINCIPIOS = (
    "Princípios inegociáveis v1.0: (i) tom INFORMATIVO, nunca acusatório direto; "
    "(ii) verbos PROIBIDOS — 'fraudou', 'desviou', 'roubou', 'corrupto'; "
    "(iii) Princípio 9 — contraditório público OBRIGATÓRIO em todo finding ≥ MÉDIA "
    "(template 3-partes: decisão judicial conhecida + manifestação pública + direito "
    "de resposta institucional via transparenciabr.org/dossie/<slug>/contestacao); "
    "(iv) Princípio 10 — fontes primárias citáveis (Portal Câmara CEAP via API Dados "
    "Abertos, Portal Transparência, TSE DivulgaCandContas, TRF/STF/PJe, BrasilAPI, "
    "Receita Federal), PROIBIDO citar 'BigQuery', 'vw_*' ou nomes internos de views; "
    "(v) Princípio 11 — checagem ativa de explicação benigna em findings ≥ ALTA "
    "(Google Scholar, Lattes, LinkedIn, Wayback) com reclassificação transparente; "
    "(vi) sweet-spot 40-55 findings com distribuição 10-15 CRÍTICA · 15-20 ALTA · "
    "12-16 MÉDIA · 8-12 INFORMATIVO; (vii) LGPD — CPF mascarado ***.XXX.XXX-**."
)


_V1_AGENTS_SPEC: tuple[tuple[str, str, str, str], ...] = (
    (
        "identificacao",
        "Agente · Identificação",
        "🪪",
        "Coleta de identidade completa do alvo via TSE DivulgaCandContas, API "
        "Dados Abertos da Câmara dos Deputados, perfis sociais oficiais "
        "(Instagram, X/Twitter, YouTube, Threads, Linktree) e cartório eleitoral. "
        "Extrai nome completo, nome público, cargo, mandato, partido, gabinete, "
        "telefone e e-mail institucional, votação por eleição (QP/QE), trajetória "
        "partidária e marca pessoal. Devolve findings tipo INFORMATIVO (DADO "
        "ELEITORAL OFICIAL, INDICADOR DE INSERÇÃO ELEITORAL) com URLs primárias.",
    ),
    (
        "ceap_anomalias",
        "Agente · CEAP & Anomalias",
        "🧪",
        "Auditoria do CEAP (Cota para Exercício da Atividade Parlamentar) via "
        "Portal da Câmara dos Deputados (citar como 'Portal Câmara CEAP via API "
        "Dados Abertos'). Aplica Benford 1º dígito, Z-score em valores, "
        "concentração mensal/anual, detecção de locação de veículo recorrente, "
        "anomalia de combustível/passagem aérea, e gera findings com classificação "
        "ANÁLISE TIPOLÓGICA CEAP / CLASSIFICAÇÃO FORENSE AUTOMATIZADA. Cita SEMPRE "
        "fonte primária (Portal Câmara) — nunca tabelas internas.",
    ),
    (
        "emendas",
        "Agente · Emendas Parlamentares",
        "💸",
        "Cruzamento de emendas via Portal da Transparência da União "
        "(autorEmenda=<id>): autoria, beneficiários terminais, rubricas, "
        "encargos especiais (alerta — rubrica genérica), e transferências "
        "nominais (TF) para entidades específicas com CNAE verificável. "
        "Devolve findings tipo CIRCUITO FINANCEIRO / TRANSFERÊNCIA NOMINAL / "
        "ANÁLISE FUNCIONAL DE EMENDAS, citando Portal da Transparência como "
        "fonte primária.",
    ),
    (
        "judicial",
        "Agente · Judicial",
        "⚖️",
        "Consulta processos em TRF1/TRF3/TRF4 (PJe Consulta Pública), STF "
        "(Portal de Acompanhamento Processual), TJSP (Consulta Processual) e "
        "PGR/MPF (representações públicas). Extrai número do processo, parte, "
        "decisão liminar (favorável/desfavorável), e cita literalmente trecho "
        "relevante. Devolve findings tipo AÇÃO JUDICIAL ATIVA / REGISTRO "
        "JUDICIAL / DECISÃO JUDICIAL FAVORÁVEL. Decisão liminar negada NÃO "
        "invalida finding — apenas reforça contraditório.",
    ),
    (
        "eixo5_empresas",
        "Agente · Eixo 5 (Empresas Exclusivas)",
        "🏢",
        "Isolamento de CNPJs exclusivos do alvo no CEAP (citar como 'Portal "
        "Câmara CEAP'), enriquecimento via BrasilAPI e Direct Data (QSA, "
        "Beneficiário Final, CadastroPF Plus, ProcessosJudiciaisSimplificada). "
        "Cruzamento de sócios com vínculo pessoal do parlamentar — busca por "
        "padrões: empresa-clone, anagrama, e-mail corporativo com variação do "
        "nome, fundação pré-eleitoral, fundação sequencial, encerramento "
        "coordenado, valor idêntico em múltiplas empresas. Devolve findings "
        "tipo PADRÃO LARANJA / INCONSISTÊNCIA CADASTRAL.",
    ),
    (
        "osint",
        "Agente · OSINT",
        "📡",
        "Coleta OSINT com Sherlock (usernames em redes), Wayback Machine "
        "(preservação histórica de páginas alvo), Google Dorks "
        "(site:cnnbrasil.com.br, site:folha.uol.com.br, filetype:pdf), Casa "
        "dos Dados, consultacnpj.com. NÃO usa nada que possa caracterizar "
        "intrusão. Devolve findings tipo INDÍCIO DOCUMENTAL / OBSERVAÇÃO "
        "RELEVANTE com URLs primárias e snapshots Wayback.",
    ),
    (
        "contraditorio",
        "Agente · Contraditório Público",
        "🗣️",
        "Varredura de manifestações públicas da parlamentar em CNN Brasil, "
        "Folha de São Paulo, UOL, G1, Poder360, BBC e Instagram/X oficiais. "
        "Para cada finding ≥ MÉDIA da Crew, monta o template 3-partes: PARTE 1 "
        "decisão judicial conhecida (se houver, citar literal); PARTE 2 "
        "manifestação pública (URL entrevista/post); PARTE 3 direito de "
        "resposta institucional (canal transparenciabr.org/dossie/<slug>/"
        "contestacao). Quando uma parte não existir, escrever explicitamente "
        "'Não foi localizada manifestação pública específica sobre este "
        "finding até a data de publicação.'",
    ),
    (
        "falso_positivo",
        "Agente · Falso Positivo Check",
        "🔍",
        "Anti-imputação indevida. Para todo finding ≥ ALTA antes de fechar, "
        "verifica explicação benigna: Google Scholar (h-index, citações, "
        "verified email institucional), CNPq Lattes (vínculo de pesquisa), "
        "LinkedIn (histórico profissional consistente com CNAE), Wayback "
        "(site da empresa com história >5 anos), Casa dos Dados (histórico "
        "societário longo). Quando encontrar evidência benigna, reclassifica "
        "para INFORMATIVO com texto editorial transparente (modelo F-13 do "
        "caso Erika v3.5.1).",
    ),
    (
        "fonte_primaria",
        "Agente · Normalizador de Fonte Primária",
        "📚",
        "Substitui automaticamente qualquer menção interna a infraestrutura "
        "(nomes de views, tabelas analíticas, datasets de ingestão) por nome "
        "de fonte primária citável: 'Portal Câmara CEAP via API Dados "
        "Abertos', 'Portal da Transparência · Emendas Parlamentares', "
        "'Receita Federal · CNPJ (BrasilAPI)', 'TSE · DivulgaCandContas', "
        "'TRF1 PJe · Consulta Pública', 'STF · Portal de Acompanhamento "
        "Processual'. Verifica via regex blocklist que findings finais não "
        "contêm strings proibidas. Garante Princípio 10 da skill v1.0.",
    ),
    (
        "decisao_judicial",
        "Agente · Decisão Judicial Watcher",
        "🛎️",
        "Watcher de TRF/STF/PJe para decisões novas em processos citados no "
        "dossiê. Monitoramento de 30 dias pós-publicação: novas liminares, "
        "sentenças, acórdãos, embargos. Devolve findings tipo DECISÃO "
        "JUDICIAL FAVORÁVEL ou atualizações para reabrir contraditório em "
        "versão 1.0.1+ do PDF. Não imputa — apenas registra o estado "
        "processual com data, juízo, número e citação literal do dispositivo.",
    ),
)


def _build_crew_dossie_v1() -> CrewMeta:
    agentes: list[AgenteMeta] = []
    for slot, (slug, nome, avatar, descricao) in enumerate(_V1_AGENTS_SPEC, start=1):
        papel_completo = (
            f"{descricao}\n\n"
            f"Eixo da skill v1.0: {slug.upper()} (slot {slot:02d}/10 da crew "
            "Dossiê Forense v1.0). Trabalha sob coordenação do Maestro Supremo "
            "e do Comandante Baesso. Output esperado: lista JSON de findings "
            "no schema v1.0 (id, titulo, classificacao, severidade, fato, "
            "analise, contraditorio, fontes). Cada finding contribui para o "
            "sweet-spot de 40-55 findings do dossiê final.\n\n"
            f"{_V1_PRINCIPIOS}"
        )
        agentes.append(
            AgenteMeta(
                id=f"crew-dossie-forense-v1-a{slot:02d}-{slug}",
                nome=nome,
                avatar=avatar,
                papel=papel_completo,
            )
        )
    return CrewMeta(
        id="crew-dossie-forense-v1",
        nome="Dossiê Forense v1.0",
        emoji="📕",
        missao=(
            "Compilação de dossiê forense parlamentar no padrão TransparênciaBR "
            "v1.0 — 10 agentes especializados 1:1 com os eixos da skill, "
            "produzindo 40-55 findings auditáveis com fontes primárias, "
            "contraditório 3-partes e revisão de falsos positivos."
        ),
        agentes=tuple(agentes),
    )


CREW_DOSSIE_FORENSE_V1: CrewMeta = _build_crew_dossie_v1()

# Append à tupla CREWS preservando as 10 originais.
CREWS = CREWS + (CREW_DOSSIE_FORENSE_V1,)


def crews_v1() -> tuple[CrewMeta, ...]:
    """Retorna apenas as crews v1.0 (Entrega AURORA Forensic). Útil para o pipeline headless."""
    return (CREW_DOSSIE_FORENSE_V1,)


def total_agentes_v1() -> int:
    return sum(len(c.agentes) for c in crews_v1())

