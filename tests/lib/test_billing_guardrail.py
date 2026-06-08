"""Unit tests for engines.lib.billing_guardrail — spend checks and recording."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from engines.lib.billing_guardrail import (
    _blob_name_hoje,
    _ler_gasto_cloud_billing,
    _ler_gasto_gcs,
    assert_within_budget,
    check_daily_spend,
    record_spend,
)


class TestBlobNameHoje:
    def test_format(self):
        name = _blob_name_hoje()
        assert name.startswith("_billing/daily_")
        assert len(name) == len("_billing/daily_20250101.txt")
        assert name.endswith(".txt")


class TestLerGastoGcs:
    @patch("engines.lib.billing_guardrail._gcs_client", return_value=None)
    def test_returns_zero_when_no_client(self, _mock):
        assert _ler_gasto_gcs() == 0.0

    @patch("engines.lib.billing_guardrail._gcs_client")
    def test_returns_zero_when_blob_missing(self, mock_client):
        mock_bucket = MagicMock()
        mock_blob = MagicMock()
        mock_blob.exists.return_value = False
        mock_bucket.blob.return_value = mock_blob
        mock_client.return_value.bucket.return_value = mock_bucket
        assert _ler_gasto_gcs() == 0.0

    @patch("engines.lib.billing_guardrail._gcs_client")
    def test_sums_costs_from_blob(self, mock_client):
        mock_bucket = MagicMock()
        mock_blob = MagicMock()
        mock_blob.exists.return_value = True
        mock_blob.download_as_text.return_value = (
            "2025-04-20T03:12:00Z  document_ai  1.50\n"
            "2025-04-20T03:13:00Z  paddleocr  2.25\n"
            "bad line\n"
        )
        mock_bucket.blob.return_value = mock_blob
        mock_client.return_value.bucket.return_value = mock_bucket
        assert _ler_gasto_gcs() == pytest.approx(3.75)

    @patch("engines.lib.billing_guardrail._gcs_client")
    def test_returns_zero_on_exception(self, mock_client):
        mock_client.return_value.bucket.side_effect = Exception("network error")
        assert _ler_gasto_gcs() == 0.0


class TestLerGastoCloudBilling:
    def test_returns_none_without_env(self, monkeypatch):
        monkeypatch.delenv("BILLING_ACCOUNT_ID", raising=False)
        assert _ler_gasto_cloud_billing() is None

    def test_returns_none_with_env_but_no_api(self, monkeypatch):
        monkeypatch.setenv("BILLING_ACCOUNT_ID", "fake-account-123")
        result = _ler_gasto_cloud_billing()
        # Currently always returns None (Cloud Billing not implemented)
        assert result is None


class TestCheckDailySpend:
    @patch("engines.lib.billing_guardrail._ler_gasto_gcs", return_value=10.0)
    @patch("engines.lib.billing_guardrail._ler_gasto_cloud_billing", return_value=None)
    def test_under_threshold_returns_true(self, _mock_billing, _mock_gcs):
        assert check_daily_spend(threshold_usd=50.0) is True

    @patch("engines.lib.billing_guardrail._ler_gasto_gcs", return_value=55.0)
    @patch("engines.lib.billing_guardrail._ler_gasto_cloud_billing", return_value=None)
    def test_over_threshold_returns_false(self, _mock_billing, _mock_gcs):
        assert check_daily_spend(threshold_usd=50.0) is False

    @patch("engines.lib.billing_guardrail._ler_gasto_gcs", return_value=0.0)
    @patch("engines.lib.billing_guardrail._ler_gasto_cloud_billing", return_value=60.0)
    def test_cloud_billing_over_threshold(self, _mock_billing, _mock_gcs):
        assert check_daily_spend(threshold_usd=50.0) is False

    @patch("engines.lib.billing_guardrail._ler_gasto_gcs", return_value=0.0)
    @patch("engines.lib.billing_guardrail._ler_gasto_cloud_billing", return_value=10.0)
    def test_cloud_billing_under_threshold(self, _mock_billing, _mock_gcs):
        assert check_daily_spend(threshold_usd=50.0) is True


class TestRecordSpend:
    def test_negative_cost_raises(self):
        with pytest.raises(ValueError, match="negativo"):
            record_spend(servico="test", custo_usd=-1.0)

    @patch("engines.lib.billing_guardrail._gcs_client", return_value=None)
    def test_no_client_logs_warning(self, _mock):
        # Should not raise
        record_spend(servico="test_service", custo_usd=0.5)

    @patch("engines.lib.billing_guardrail._gcs_client")
    def test_appends_to_blob(self, mock_client):
        mock_bucket = MagicMock()
        mock_blob = MagicMock()
        mock_blob.download_as_text.return_value = "existing line\n"
        mock_bucket.blob.return_value = mock_blob
        mock_client.return_value.bucket.return_value = mock_bucket

        record_spend(servico="document_ai", custo_usd=1.5)

        mock_blob.upload_from_string.assert_called_once()
        uploaded = mock_blob.upload_from_string.call_args[0][0].decode("utf-8")
        assert "existing line\n" in uploaded
        assert "document_ai" in uploaded
        assert "1.500000" in uploaded


class TestAssertWithinBudget:
    @patch("engines.lib.billing_guardrail.check_daily_spend", return_value=True)
    def test_does_not_raise_when_under(self, _mock):
        assert_within_budget(threshold_usd=50.0)

    @patch("engines.lib.billing_guardrail.check_daily_spend", return_value=False)
    def test_raises_when_over(self, _mock):
        with pytest.raises(RuntimeError, match="HARD-STOP"):
            assert_within_budget(threshold_usd=50.0)
