"""Unit tests for engines.preflight_check — environment variable checks."""
from __future__ import annotations

from unittest.mock import patch

from engines.preflight_check import main


class TestPreflightCheck:
    def test_all_vars_present_returns_zero(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_xxx")
        monkeypatch.setenv("GCP_PROJECT_ID", "my-project")
        monkeypatch.setenv("VITE_RADAR_ADMIN_UID", "uid-123")
        assert main() == 0

    def test_missing_gemini_key_returns_one(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_xxx")
        monkeypatch.setenv("GCP_PROJECT_ID", "my-project")
        monkeypatch.setenv("VITE_RADAR_ADMIN_UID", "uid-123")
        assert main() == 1

    def test_missing_stripe_key_returns_one(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
        monkeypatch.setenv("GCP_PROJECT_ID", "my-project")
        monkeypatch.setenv("VITE_RADAR_ADMIN_UID", "uid-123")
        assert main() == 1

    def test_missing_gcp_project_returns_one(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_xxx")
        monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
        monkeypatch.delenv("GCP_PROJECT", raising=False)
        monkeypatch.setenv("VITE_RADAR_ADMIN_UID", "uid-123")
        assert main() == 1

    def test_gcp_project_fallback_env(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_xxx")
        monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
        monkeypatch.setenv("GCP_PROJECT", "fallback-project")
        monkeypatch.setenv("VITE_RADAR_ADMIN_UID", "uid-123")
        assert main() == 0

    def test_radar_admin_uid_fallback(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_xxx")
        monkeypatch.setenv("GCP_PROJECT_ID", "my-project")
        monkeypatch.delenv("VITE_RADAR_ADMIN_UID", raising=False)
        monkeypatch.setenv("RADAR_OWNER_UID", "fallback-uid")
        assert main() == 0

    def test_missing_radar_uid_returns_one(self, monkeypatch):
        monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
        monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_xxx")
        monkeypatch.setenv("GCP_PROJECT_ID", "my-project")
        monkeypatch.delenv("VITE_RADAR_ADMIN_UID", raising=False)
        monkeypatch.delenv("RADAR_OWNER_UID", raising=False)
        assert main() == 1

    def test_all_missing_returns_one(self, monkeypatch):
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
        monkeypatch.delenv("GCP_PROJECT_ID", raising=False)
        monkeypatch.delenv("GCP_PROJECT", raising=False)
        monkeypatch.delenv("VITE_RADAR_ADMIN_UID", raising=False)
        monkeypatch.delenv("RADAR_OWNER_UID", raising=False)
        assert main() == 1
