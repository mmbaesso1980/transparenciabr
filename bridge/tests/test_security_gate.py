"""Testes do SecurityGate — deploy/deployer.SecurityGate.

Cenários:
- Bloqueia diff com token cog_...
- Bloqueia diff com chave AIza...
- Bloqueia diff com PEM
- Bloqueia comandos destrutivos (DROP TABLE, rm -rf /)
- Libera diff limpo
"""

import pytest

from deploy.deployer import GateResult, SecurityGate


@pytest.fixture
def gate():
    return SecurityGate()


class TestSecretDetection:
    """SecurityGate detecta segredos no diff."""

    def test_bloqueia_token_devin(self, gate):
        """Token cog_... é detectado e bloqueado."""
        diff = '+API_KEY = "cog_abcdefghijk12345"'
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK
        assert any(f.category == "secret" for f in findings)
        assert any("devin_token" in f.description for f in findings)

    def test_bloqueia_chave_google(self, gate):
        """Chave AIza... é detectada e bloqueada."""
        diff = "+GOOGLE_KEY = \"AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe\""
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK
        assert any("google_api_key" in f.description for f in findings)

    def test_bloqueia_pem(self, gate):
        """Chave PEM privada é detectada e bloqueada."""
        diff = "+-----BEGIN RSA PRIVATE KEY-----\n+MIIEowIBAAKCAQEA..."
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK
        assert any("private_key_pem" in f.description for f in findings)

    def test_bloqueia_token_openai(self, gate):
        """Token sk-... da OpenAI é detectado."""
        diff = '+OPENAI_KEY = "sk-proj1234567890abcdefghij"'
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK

    def test_bloqueia_token_github(self, gate):
        """Token ghp_... do GitHub é detectado."""
        diff = '+GH_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyz1234"'
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK

    def test_ignora_linhas_removidas(self, gate):
        """Linhas removidas (prefixo -) não disparam alerta."""
        diff = '-OLD_KEY = "cog_abcdefghijk12345"'
        result, findings = gate.scan(diff)
        assert result == GateResult.PASS
        assert len(findings) == 0


class TestDestructiveCommands:
    """SecurityGate detecta comandos destrutivos."""

    def test_bloqueia_drop_table(self, gate):
        """DROP TABLE é detectado e bloqueado."""
        diff = "+DROP TABLE users;"
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK
        assert any("drop_table" in f.description for f in findings)

    def test_bloqueia_drop_table_case_insensitive(self, gate):
        """DROP TABLE case-insensitive."""
        diff = "+drop table sensitive_data;"
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK

    def test_bloqueia_truncate(self, gate):
        """TRUNCATE é detectado."""
        diff = "+TRUNCATE TABLE audit_log;"
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK

    def test_bloqueia_rm_rf(self, gate):
        """rm -rf / é detectado."""
        diff = "+rm -rf /"
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK
        assert any("rm_rf" in f.description for f in findings)

    def test_bloqueia_delete_from(self, gate):
        """DELETE FROM é detectado."""
        diff = "+DELETE FROM users WHERE id > 0;"
        result, findings = gate.scan(diff)
        assert result == GateResult.BLOCK


class TestDiffLimpo:
    """SecurityGate libera diffs seguros."""

    def test_libera_diff_limpo(self, gate):
        """Diff sem segredos ou comandos destrutivos passa."""
        diff = (
            "+def hello():\n"
            '+    return "world"\n'
            "+\n"
            "+# Normal comment\n"
            "+x = 42"
        )
        result, findings = gate.scan(diff)
        assert result == GateResult.PASS
        assert len(findings) == 0

    def test_libera_diff_vazio(self, gate):
        """Diff vazio passa."""
        result, findings = gate.scan("")
        assert result == GateResult.PASS

    def test_libera_sql_seguro(self, gate):
        """SQL sem DROP/TRUNCATE/DELETE passa."""
        diff = (
            "+CREATE TABLE users (id INT, name TEXT);\n"
            "+INSERT INTO users VALUES (1, 'test');\n"
            "+SELECT * FROM users;"
        )
        result, findings = gate.scan(diff)
        assert result == GateResult.PASS
