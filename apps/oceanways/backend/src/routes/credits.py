"""
Ocean Ways — Route: /api/v1/credits
=====================================
Consulta e gerenciamento do saldo de créditos do usuário.

O saldo de créditos tem duas fontes:
  - credits_monthly: créditos do plano (expiram na renovação)
  - credits_topup: créditos avulsos top-up (sem expiração)

Ordem de consumo: credits_monthly primeiro, depois credits_topup.

TODO (Maestro):
  [ ] Implementar GET /balance (lê Firestore users/{uid})
  [ ] Implementar GET /history (lê BQ oceanways.credits WHERE uid)
  [ ] O crédito é debitado pelo backend — NUNCA pelo frontend
  [ ] Garantir atomicidade: debitar crédito e registrar busca na mesma operação
      (Firestore transaction ou 2-phase: débito → busca → confirma; rollback se busca falhar)
"""

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter()


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CreditBalance(BaseModel):
    """Saldo de créditos do usuário.

    Example:
        {
            "credits_monthly": 287,
            "credits_topup": 100,
            "total": 387,
            "plan": "PRO",
            "plan_renewal_at": "2026-07-01"
        }
    """
    credits_monthly: int
    credits_topup: int
    total: int
    plan: str
    plan_renewal_at: str | None


class CreditLedgerEntry(BaseModel):
    """Entrada do ledger de créditos.

    Example:
        {
            "credit_id": "uuid",
            "operation": "DEBIT",
            "amount": -1,
            "balance_after": 386,
            "reason": "SEARCH",
            "reference_id": "search_uuid",
            "created_at": "2026-06-15T14:32:00Z"
        }
    """
    credit_id: str
    operation: str  # DEBIT | CREDIT | REFUND | EXPIRY
    amount: int
    balance_after: int
    reason: str
    reference_id: str | None
    created_at: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.get("/balance", response_model=CreditBalance, summary="Saldo de créditos")
async def get_balance(request: Request):
    """
    Retorna saldo atual de créditos do usuário autenticado.

    Lê do Firestore users/{uid} (fonte de verdade para saldo).

    TODO (Maestro): extrair uid do JWT; ler Firestore
    """
    return CreditBalance(
        credits_monthly=0,
        credits_topup=0,
        total=0,
        plan="FREE",
        plan_renewal_at=None,
    )


@router.get("/history", summary="Histórico do ledger de créditos")
async def get_credit_history(request: Request, limit: int = 50, offset: int = 0):
    """
    Retorna histórico de movimentações de crédito.

    Dados lidos do BigQuery oceanways.credits WHERE uid = $uid.
    Ordenado por created_at DESC.

    TODO (Maestro):
      [ ] Consulta BQ paginada
      [ ] Retornar lista de CreditLedgerEntry
    """
    return {"history": [], "total": 0, "message": "TODO: não implementado"}
