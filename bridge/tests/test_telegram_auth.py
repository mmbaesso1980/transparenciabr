"""Testes de autorização do TelegramAgent.

Verifica que comandos privilegiados exigem chat_id do Comandante.
"""

import pytest
from unittest.mock import patch, MagicMock

from devin_bridge.config import TelegramConfig, GCPConfig, WolfConfig
from listener.telegram_agent import TelegramAgent


@pytest.fixture
def agent():
    """Agent com commander_chat_id configurado."""
    tg_config = TelegramConfig(
        bot_token="fake_token",
        commander_chat_id="12345",
    )
    with patch("listener.telegram_agent.AuditLogger"):
        with patch("listener.telegram_agent.TelegramAlerts"):
            a = TelegramAgent.__new__(TelegramAgent)
            a._tg_config = tg_config
            a._gcp_config = GCPConfig()
            a._wolf_config = WolfConfig()
            a._alerts = MagicMock()
            a._audit = MagicMock()
            a._registry = MagicMock()
            a._offset = None
            a._base_url = "https://api.telegram.org/botfake_token"
            a._fs_client = None
            return a


class TestAuthorization:
    """Comandos privilegiados exigem autorização."""

    def test_authorized_commander(self, agent):
        """Comandante autorizado pode executar /aprovar."""
        assert agent._is_authorized(12345) is True

    def test_unauthorized_user(self, agent):
        """Usuário não autorizado é rejeitado."""
        assert agent._is_authorized(99999) is False

    def test_string_comparison_works(self, agent):
        """Comparação funciona com int vs string."""
        assert agent._is_authorized(12345) is True

    def test_no_commander_id_allows_all(self):
        """Sem commander_chat_id configurado, todos são permitidos."""
        tg_config = TelegramConfig(
            bot_token="fake_token",
            commander_chat_id="",
        )
        with patch("listener.telegram_agent.AuditLogger"):
            with patch("listener.telegram_agent.TelegramAlerts"):
                a = TelegramAgent.__new__(TelegramAgent)
                a._tg_config = tg_config
                a._gcp_config = GCPConfig()
                a._wolf_config = WolfConfig()
                a._alerts = MagicMock()
                a._audit = MagicMock()
                a._registry = MagicMock()
                a._offset = None
                a._base_url = "https://api.telegram.org/botfake_token"
                a._fs_client = None
                assert a._is_authorized(99999) is True

    def test_privileged_commands_list(self, agent):
        """Comandos privilegiados estão na lista."""
        assert "/aprovar" in agent.PRIVILEGED_COMMANDS
        assert "/negar" in agent.PRIVILEGED_COMMANDS
        assert "/deploy" in agent.PRIVILEGED_COMMANDS
        assert "/decisao" in agent.PRIVILEGED_COMMANDS
        assert "/wolf" in agent.PRIVILEGED_COMMANDS
        # Comandos públicos NÃO estão na lista
        assert "/status" not in agent.PRIVILEGED_COMMANDS
        assert "/arsenal" not in agent.PRIVILEGED_COMMANDS
