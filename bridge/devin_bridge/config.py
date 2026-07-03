"""Configurações centralizadas via variáveis de ambiente.

Nenhum segredo hardcoded. Todos os valores sensíveis vêm de env ou Secret Manager.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class DevinConfig:
    """Configuração da Devin v3 API."""

    api_key: str = field(default_factory=lambda: os.environ.get("DEVIN_API_KEY", ""))
    org_id: str = field(default_factory=lambda: os.environ.get("DEVIN_ORG_ID", ""))
    base_url: str = field(
        default_factory=lambda: os.environ.get(
            "DEVIN_BASE_URL", "https://api.devin.ai/v3"
        )
    )
    poll_interval_seconds: int = field(
        default_factory=lambda: int(os.environ.get("DEVIN_POLL_INTERVAL", "30"))
    )


@dataclass(frozen=True)
class GCPConfig:
    """Configuração GCP (BigQuery, Firestore, Secret Manager)."""

    codex_project: str = field(
        default_factory=lambda: os.environ.get("CODEX_PROJECT", "projeto-codex-br")
    )
    tbr_project: str = field(
        default_factory=lambda: os.environ.get("TBR_PROJECT", "transparenciabr")
    )
    region: str = field(
        default_factory=lambda: os.environ.get("GCP_REGION", "us-east1")
    )
    audit_dataset: str = field(
        default_factory=lambda: os.environ.get("AUDIT_DATASET", "bridge_audit")
    )
    audit_table: str = field(
        default_factory=lambda: os.environ.get("AUDIT_TABLE", "events")
    )


@dataclass(frozen=True)
class TelegramConfig:
    """Configuração do bot Telegram."""

    bot_token: str = field(
        default_factory=lambda: os.environ.get("TELEGRAM_BOT_TOKEN", "")
    )
    commander_chat_id: str = field(
        default_factory=lambda: os.environ.get("TELEGRAM_COMMANDER_CHAT_ID", "")
    )
    max_message_length: int = 3500
    rate_limit_max_retries: int = field(
        default_factory=lambda: int(
            os.environ.get("TELEGRAM_RATE_LIMIT_RETRIES", "5")
        )
    )


@dataclass(frozen=True)
class DeployConfig:
    """Configuração de deploy."""

    environment: str = field(
        default_factory=lambda: os.environ.get("DEPLOY_ENV", "staging")
    )
    vm_name: str = field(
        default_factory=lambda: os.environ.get(
            "DEPLOY_VM_NAME", "devin-bridge-listener"
        )
    )
    vm_zone: str = field(
        default_factory=lambda: os.environ.get("DEPLOY_VM_ZONE", "us-east1-b")
    )
    require_human_gate: bool = True


@dataclass(frozen=True)
class WolfConfig:
    """Limiares calibráveis da Doutrina WOLF via env."""

    override_tecnico_limiar: float = field(
        default_factory=lambda: float(
            os.environ.get("WOLF_OVERRIDE_TECNICO_LIMIAR", "0.75")
        )
    )
    override_massa_minima: int = field(
        default_factory=lambda: int(
            os.environ.get("WOLF_OVERRIDE_MASSA_MINIMA", "3")
        )
    )
    fator_fundamento_sob_override: float = field(
        default_factory=lambda: float(
            os.environ.get("WOLF_FATOR_FUNDAMENTO_SOB_OVERRIDE", "0.3")
        )
    )
