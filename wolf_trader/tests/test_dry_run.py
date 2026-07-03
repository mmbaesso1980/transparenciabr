"""Testes de DRY_RUN: em modo seco, nenhuma ordem real é enviada."""
from __future__ import annotations

import pytest

from wolf_trader.polymarket_client import (
    OrdemRequest, OrdemResultado, PolymarketTrader, Signer,
)


class FakeSigner(Signer):
    """Signer que NÃO acessa rede nem chave real."""

    def __init__(self):
        # Provider que nunca deveria ser chamado em dry_run
        super().__init__(
            private_key_provider=lambda: (_ for _ in ()).throw(
                RuntimeError("Chave não deve ser acessada em DRY_RUN")
            ),
            funder_address="0x0000000000000000000000000000000000000000",
        )

    def _ensure_client(self):
        raise RuntimeError("Cliente CLOB não deve ser instanciado em DRY_RUN")


class TestDryRun:
    """DRY_RUN=true NÃO envia ordem real."""

    def test_dry_run_true_nao_envia(self):
        """Trader com dry_run=True retorna sucesso sem acessar rede."""
        trader = PolymarketTrader(signer=FakeSigner(), dry_run=True)
        req = OrdemRequest(token_id="tok_abc123", lado="BUY", preco=0.55, size=10.0)
        result = trader.postar_ordem(req)
        assert result.ok is True
        assert "DRY_RUN" in result.detalhe
        assert result.order_id is None

    def test_dry_run_true_nao_acessa_chave(self):
        """Em DRY_RUN, a chave privada nunca é acessada."""
        acessos: list[str] = []

        def pk_provider() -> str:
            acessos.append("acessou")
            return "0x_fake"

        signer = Signer(
            private_key_provider=pk_provider,
            funder_address="0x0000000000000000000000000000000000000000",
        )
        trader = PolymarketTrader(signer=signer, dry_run=True)
        req = OrdemRequest(token_id="tok_xyz", lado="SELL", preco=0.4, size=5.0)
        trader.postar_ordem(req)
        assert acessos == [], "Chave privada não deve ser acessada em DRY_RUN"

    def test_dry_run_rejeita_preco_invalido(self):
        """Mesmo em DRY_RUN, validação de preço é aplicada."""
        trader = PolymarketTrader(signer=FakeSigner(), dry_run=True)
        req = OrdemRequest(token_id="tok", lado="BUY", preco=1.5, size=10.0)
        result = trader.postar_ordem(req)
        assert result.ok is False
        assert "preco fora de faixa" in result.detalhe

    def test_dry_run_rejeita_size_zero(self):
        """DRY_RUN ainda valida size > 0."""
        trader = PolymarketTrader(signer=FakeSigner(), dry_run=True)
        req = OrdemRequest(token_id="tok", lado="BUY", preco=0.5, size=0)
        result = trader.postar_ordem(req)
        assert result.ok is False
        assert "size invalido" in result.detalhe

    def test_dry_run_default_true(self):
        """Default de dry_run deve ser True (segurança)."""
        trader = PolymarketTrader(signer=FakeSigner())
        assert trader.dry_run is True
