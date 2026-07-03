"""Wrapper da Devin v3 API com RBAC por método.

Permissões necessárias do service user:
- CreateOrgSessions
- ViewOrgSessions
- SendOrgSessionMessages
- ImpersonateOrgSessions (apenas se usar create_as_user_id)
"""

from __future__ import annotations

import logging
from typing import Any

import requests

from .config import DevinConfig

logger = logging.getLogger(__name__)


class DevinAPIError(Exception):
    """Erro retornado pela Devin API."""

    def __init__(self, status_code: int, message: str) -> None:
        self.status_code = status_code
        self.message = message
        super().__init__(f"HTTP {status_code}: {message}")


class DevinClient:
    """Cliente tipado para a Devin v3 API.

    Cada método mapeia a permissão RBAC exigida.
    """

    REQUIRED_PERMISSIONS = {
        "create_session": "CreateOrgSessions",
        "get_session": "ViewOrgSessions",
        "list_sessions": "ViewOrgSessions",
        "send_message": "SendOrgSessionMessages",
    }

    def __init__(self, config: DevinConfig | None = None) -> None:
        self._config = config or DevinConfig()
        self._base = (
            f"{self._config.base_url}/organizations/{self._config.org_id}"
        )
        self._headers = {
            "Authorization": f"Bearer {self._config.api_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        url = f"{self._base}{path}"
        resp = requests.request(method, url, headers=self._headers, **kwargs)
        if resp.status_code in (401, 403):
            permission = kwargs.get("_permission", "unknown")
            raise DevinAPIError(
                resp.status_code,
                f"Permissão insuficiente. Necessária: {permission}. "
                f"Resposta: {resp.text}",
            )
        if not resp.ok:
            raise DevinAPIError(resp.status_code, resp.text)
        return resp.json() if resp.content else {}

    def create_session(
        self,
        prompt: str,
        *,
        repos: list[str] | None = None,
        title: str | None = None,
        tags: list[str] | None = None,
        devin_mode: str | None = None,
        max_acu_limit: int | None = None,
        create_as_user_id: str | None = None,
    ) -> dict[str, Any]:
        """POST /sessions — Requer CreateOrgSessions."""
        body: dict[str, Any] = {"prompt": prompt}
        if repos:
            body["repos"] = repos
        if title:
            body["title"] = title
        if tags:
            body["tags"] = tags
        if devin_mode:
            body["devin_mode"] = devin_mode
        if max_acu_limit is not None:
            body["max_acu_limit"] = max_acu_limit
        if create_as_user_id:
            body["create_as_user_id"] = create_as_user_id
        return self._request(
            "POST",
            "/sessions",
            json=body,
            _permission="CreateOrgSessions",
        )

    def get_session(self, devin_id: str) -> dict[str, Any]:
        """GET /sessions/{devin_id} — Requer ViewOrgSessions."""
        return self._request(
            "GET",
            f"/sessions/{devin_id}",
            _permission="ViewOrgSessions",
        )

    def list_sessions(self) -> dict[str, Any]:
        """GET /sessions — Requer ViewOrgSessions."""
        return self._request(
            "GET",
            "/sessions",
            _permission="ViewOrgSessions",
        )

    def send_message(self, devin_id: str, message: str) -> dict[str, Any]:
        """POST /sessions/{devin_id}/messages — Requer SendOrgSessionMessages."""
        return self._request(
            "POST",
            f"/sessions/{devin_id}/messages",
            json={"message": message},
            _permission="SendOrgSessionMessages",
        )
