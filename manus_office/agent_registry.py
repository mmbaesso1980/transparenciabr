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
