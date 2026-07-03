"""Catálogo de skills e conectores do projeto TransparênciaBR/AURORA."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Skill:
    """Uma skill registrada no catálogo."""

    name: str
    description: str
    module: str
    enabled: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class Connector:
    """Um conector externo registrado."""

    name: str
    connector_type: str
    endpoint: str
    enabled: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


class Registry:
    """Catálogo central de skills e conectores disponíveis."""

    def __init__(self) -> None:
        self._skills: dict[str, Skill] = {}
        self._connectors: dict[str, Connector] = {}

    def register_skill(self, skill: Skill) -> None:
        """Registra uma skill no catálogo."""
        self._skills[skill.name] = skill

    def register_connector(self, connector: Connector) -> None:
        """Registra um conector no catálogo."""
        self._connectors[connector.name] = connector

    def get_skill(self, name: str) -> Skill | None:
        """Retorna skill por nome ou None."""
        return self._skills.get(name)

    def get_connector(self, name: str) -> Connector | None:
        """Retorna conector por nome ou None."""
        return self._connectors.get(name)

    def list_skills(self, *, enabled_only: bool = True) -> list[Skill]:
        """Lista skills registradas."""
        skills = list(self._skills.values())
        if enabled_only:
            return [s for s in skills if s.enabled]
        return skills

    def list_connectors(self, *, enabled_only: bool = True) -> list[Connector]:
        """Lista conectores registrados."""
        connectors = list(self._connectors.values())
        if enabled_only:
            return [c for c in connectors if c.enabled]
        return connectors

    def to_dict(self) -> dict[str, Any]:
        """Serializa catálogo para exibição."""
        return {
            "skills": [
                {"name": s.name, "description": s.description, "enabled": s.enabled}
                for s in self._skills.values()
            ],
            "connectors": [
                {
                    "name": c.name,
                    "type": c.connector_type,
                    "endpoint": c.endpoint,
                    "enabled": c.enabled,
                }
                for c in self._connectors.values()
            ],
        }
