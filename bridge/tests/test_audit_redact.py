"""Testes do audit._redact — mascaramento de CPF e segredos.

Garante que:
- CPF nunca aparece em texto claro (sempre ***.XXX.XXX-**)
- Tokens/chaves são substituídos por [REDACTED]
"""

import pytest

from devin_bridge.audit import _redact


class TestCPFRedaction:
    """CPF é mascarado em todos os formatos."""

    def test_cpf_com_pontuacao(self):
        """CPF 123.456.789-01 → ***.456.789-**."""
        result = _redact("CPF: 123.456.789-01")
        assert "123" not in result
        assert "01" not in result.split("-")[-1][:2] or "**" in result
        assert "***.456.789-**" in result

    def test_cpf_sem_pontuacao(self):
        """CPF 12345678901 → ***.456.789-**."""
        result = _redact("CPF: 12345678901")
        assert "***.456.789-**" in result

    def test_multiplos_cpfs(self):
        """Múltiplos CPFs são todos mascarados."""
        text = "A: 111.222.333-44, B: 555.666.777-88"
        result = _redact(text)
        assert "***.222.333-**" in result
        assert "***.666.777-**" in result
        assert "111" not in result
        assert "555" not in result

    def test_texto_sem_cpf_intacto(self):
        """Texto sem CPF não é alterado."""
        text = "Relatório de auditoria sem dados sensíveis."
        assert _redact(text) == text


class TestSecretRedaction:
    """Segredos são substituídos por [REDACTED]."""

    def test_token_devin(self):
        """Token cog_... → [REDACTED]."""
        text = "Token: cog_abcdefghijk12345678"
        result = _redact(text)
        assert "cog_" not in result
        assert "[REDACTED]" in result

    def test_chave_google(self):
        """Chave AIza... → [REDACTED]."""
        text = "Key: AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe"
        result = _redact(text)
        assert "AIza" not in result
        assert "[REDACTED]" in result

    def test_pem_header(self):
        """Header PEM → [REDACTED]."""
        text = "-----BEGIN RSA PRIVATE KEY-----"
        result = _redact(text)
        assert "PRIVATE KEY" not in result
        assert "[REDACTED]" in result

    def test_token_openai(self):
        """Token sk-... → [REDACTED]."""
        text = "OPENAI: sk-proj1234567890abcdefghij"
        result = _redact(text)
        assert "sk-" not in result
        assert "[REDACTED]" in result

    def test_token_github(self):
        """Token ghp_... → [REDACTED]."""
        text = "GH: ghp_1234567890abcdefghijklmnopqrstuvwxyz1234"
        result = _redact(text)
        assert "ghp_" not in result
        assert "[REDACTED]" in result

    def test_multiplos_segredos(self):
        """Múltiplos segredos no mesmo texto são todos redacted."""
        text = "A=cog_abcdefghijk12345678 B=AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe"
        result = _redact(text)
        assert result.count("[REDACTED]") == 2

    def test_texto_limpo_intacto(self):
        """Texto sem segredos não é alterado."""
        text = "Deploy realizado com sucesso em us-east1."
        assert _redact(text) == text


class TestCombined:
    """CPF + segredos no mesmo texto."""

    def test_cpf_e_token_juntos(self):
        """Ambos são mascarados simultaneamente."""
        text = "User 123.456.789-01 token=cog_abcdefghijk12345678"
        result = _redact(text)
        assert "***.456.789-**" in result
        assert "[REDACTED]" in result
        assert "123" not in result.split("***")[0]
