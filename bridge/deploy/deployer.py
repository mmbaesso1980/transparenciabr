"""SecurityGate e Deployer — validação de segurança pré-deploy.

SecurityGate varre diffs em busca de segredos e comandos destrutivos.
Deployer orquestra staging (automático) e produção (gate humano obrigatório).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any

from devin_bridge.config import DeployConfig

logger = logging.getLogger(__name__)


class GateResult(str, Enum):
    """Resultado da verificação SecurityGate."""

    PASS = "PASS"
    BLOCK = "BLOCK"


@dataclass
class SecurityFinding:
    """Um achado de segurança no diff."""

    category: str
    description: str
    line: str


class SecurityGate:
    """Varre diffs em busca de segredos e comandos destrutivos.

    Bloqueia deploy se encontrar:
    - Tokens Devin (cog_...)
    - Chaves Google (AIza...)
    - Chaves PEM (-----BEGIN ... PRIVATE KEY-----)
    - Tokens OpenAI (sk-...)
    - Tokens GitHub (ghp_/ghs_...)
    - Comandos destrutivos (DROP TABLE, TRUNCATE, DELETE FROM, rm -rf /)
    """

    SECRET_PATTERNS = [
        ("devin_token", re.compile(r"cog_[A-Za-z0-9_\-]{10,}")),
        ("google_api_key", re.compile(r"AIza[A-Za-z0-9_\-]{30,}")),
        ("private_key_pem", re.compile(r"-----BEGIN [A-Z ]+PRIVATE KEY-----")),
        ("openai_token", re.compile(r"sk-[A-Za-z0-9]{20,}")),
        ("github_token", re.compile(r"gh[ps]_[A-Za-z0-9]{36,}")),
    ]

    DESTRUCTIVE_PATTERNS = [
        ("drop_table", re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE)),
        ("truncate", re.compile(r"\bTRUNCATE\b", re.IGNORECASE)),
        ("delete_from", re.compile(r"\bDELETE\s+FROM\b", re.IGNORECASE)),
        ("rm_rf", re.compile(r"\brm\s+-rf\s+/", re.IGNORECASE)),
    ]

    def scan(self, diff: str) -> tuple[GateResult, list[SecurityFinding]]:
        """Varre o diff e retorna resultado + achados."""
        findings: list[SecurityFinding] = []

        for line in diff.splitlines():
            # Ignorar linhas removidas (começam com -)
            if line.startswith("-") and not line.startswith("---"):
                continue

            for name, pattern in self.SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append(
                        SecurityFinding(
                            category="secret",
                            description=f"Segredo detectado: {name}",
                            line=line[:100],
                        )
                    )

            for name, pattern in self.DESTRUCTIVE_PATTERNS:
                if pattern.search(line):
                    findings.append(
                        SecurityFinding(
                            category="destructive",
                            description=f"Comando destrutivo: {name}",
                            line=line[:100],
                        )
                    )

        result = GateResult.BLOCK if findings else GateResult.PASS
        return result, findings


class Deployer:
    """Orquestra deploy com SecurityGate + gate humano para produção."""

    def __init__(self, config: DeployConfig | None = None) -> None:
        self._config = config or DeployConfig()
        self._gate = SecurityGate()
        self._pending_approval: dict[str, Any] | None = None

    def validate(self, diff: str) -> tuple[GateResult, list[SecurityFinding]]:
        """Valida diff antes de deploy."""
        return self._gate.scan(diff)

    def request_deploy(
        self, diff: str, *, target: str = "staging"
    ) -> dict[str, Any]:
        """Solicita deploy. Staging = automático; produção = gate humano."""
        result, findings = self.validate(diff)

        if result == GateResult.BLOCK:
            return {
                "status": "blocked",
                "reason": "SecurityGate bloqueou o deploy.",
                "findings": [
                    {"category": f.category, "description": f.description}
                    for f in findings
                ],
            }

        if target == "production" or self._config.environment == "production":
            self._pending_approval = {"diff": diff, "target": target}
            return {
                "status": "pending_approval",
                "message": (
                    "Deploy em produção requer aprovação do Comandante Baesso. "
                    "Use /aprovar para confirmar."
                ),
            }

        return {
            "status": "approved",
            "target": target,
            "message": f"Deploy em {target} aprovado automaticamente.",
        }

    def approve(self) -> dict[str, Any]:
        """Aprova deploy pendente (gate humano satisfeito)."""
        if not self._pending_approval:
            return {"status": "error", "message": "Nenhum deploy pendente."}
        deploy_info = self._pending_approval
        self._pending_approval = None
        return {
            "status": "approved",
            "target": deploy_info["target"],
            "message": "Deploy aprovado pelo Comandante.",
        }

    def deny(self) -> dict[str, Any]:
        """Nega deploy pendente."""
        if not self._pending_approval:
            return {"status": "error", "message": "Nenhum deploy pendente."}
        self._pending_approval = None
        return {"status": "denied", "message": "Deploy negado pelo Comandante."}
