"""MCP Server — 10 ferramentas expondo a ponte Devin ↔ Vertex AI.

Ferramentas disponíveis para chamada via MCP:
1. wolf_avaliar — Avalia sinais e retorna decisão WOLF
2. wolf_system_prompt — Retorna o system prompt WOLF
3. session_create — Cria sessão Devin
4. session_get — Consulta sessão Devin
5. session_list — Lista sessões Devin
6. session_message — Envia mensagem a sessão Devin
7. deploy_validate — Valida diff via SecurityGate
8. registry_skills — Lista skills registradas
9. registry_connectors — Lista conectores registrados
10. audit_log — Registra evento de auditoria
"""

from __future__ import annotations

from typing import Any

from devin_bridge.audit import AuditLogger
from devin_bridge.config import DevinConfig, GCPConfig, WolfConfig
from devin_bridge.devin_client import DevinClient
from deploy.deployer import SecurityGate
from devin_bridge.registry import Registry
from devin_bridge.wolf_doctrine import (
    WOLF_SYSTEM,
    Decisao,
    LinhaDecisao,
    Sinal,
    avaliar,
)


class MCPServer:
    """Servidor MCP com 10 ferramentas da ponte."""

    def __init__(
        self,
        devin_config: DevinConfig | None = None,
        gcp_config: GCPConfig | None = None,
        wolf_config: WolfConfig | None = None,
        registry: Registry | None = None,
    ) -> None:
        self._devin = DevinClient(devin_config or DevinConfig())
        self._audit = AuditLogger(gcp_config or GCPConfig())
        self._wolf_config = wolf_config or WolfConfig()
        self._gate = SecurityGate()
        self._registry = registry or Registry()

    def wolf_avaliar(self, sinais_raw: list[dict[str, Any]]) -> dict[str, Any]:
        """Avalia sinais e retorna decisão WOLF."""
        sinais = [
            Sinal(
                linha=LinhaDecisao(s["linha"]),
                codigo=s["codigo"],
                direcao=s["direcao"],
                conviccao=s["conviccao"],
                peso=s.get("peso", 1.0),
            )
            for s in sinais_raw
        ]
        decisao = avaliar(sinais, self._wolf_config)
        return {
            "acao": decisao.acao.value,
            "conviccao": decisao.conviccao,
            "override_tecnico": decisao.override_tecnico,
            "racional": decisao.racional,
            "sinais_usados": decisao.sinais_usados,
        }

    def wolf_system_prompt(self) -> str:
        """Retorna o system prompt WOLF."""
        return WOLF_SYSTEM

    def session_create(self, prompt: str, **kwargs: Any) -> dict[str, Any]:
        """Cria sessão Devin."""
        return self._devin.create_session(prompt, **kwargs)

    def session_get(self, devin_id: str) -> dict[str, Any]:
        """Consulta sessão Devin."""
        return self._devin.get_session(devin_id)

    def session_list(self) -> dict[str, Any]:
        """Lista sessões Devin."""
        return self._devin.list_sessions()

    def session_message(self, devin_id: str, message: str) -> dict[str, Any]:
        """Envia mensagem a sessão Devin."""
        return self._devin.send_message(devin_id, message)

    def deploy_validate(self, diff: str) -> dict[str, Any]:
        """Valida diff via SecurityGate."""
        result, findings = self._gate.scan(diff)
        return {
            "result": result.value,
            "findings": [
                {"category": f.category, "description": f.description}
                for f in findings
            ],
        }

    def registry_skills(self) -> list[dict[str, Any]]:
        """Lista skills registradas."""
        return [
            {"name": s.name, "description": s.description, "enabled": s.enabled}
            for s in self._registry.list_skills(enabled_only=False)
        ]

    def registry_connectors(self) -> list[dict[str, Any]]:
        """Lista conectores registrados."""
        return [
            {
                "name": c.name,
                "type": c.connector_type,
                "endpoint": c.endpoint,
                "enabled": c.enabled,
            }
            for c in self._registry.list_connectors(enabled_only=False)
        ]

    def audit_log(
        self, event_type: str, data: dict[str, Any], actor: str = "system"
    ) -> dict[str, Any]:
        """Registra evento de auditoria."""
        return self._audit.log_event(event_type, data, actor=actor)
