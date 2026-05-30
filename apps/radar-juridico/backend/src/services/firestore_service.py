"""
Firestore Service — Radar Jurídico INSS

Wrapper para operações Firestore do módulo.
Usa Admin SDK (não SDK web) para garantir privilégios corretos.

Coleções gerenciadas:
    usuarios/{uid}                          — créditos (compartilhado com o resto do app)
    radar_juridico_alertas/{uid}/watches/   — alertas do usuário
    radar_juridico_config/{uid}             — configurações do usuário
    radar_juridico_lgpd_audit/{auditId}     — espelho do log BQ
    radar_juridico_pje_cache/{cacheKey}     — cache PJe com TTL
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger("radar.firestore_service")

FIRESTORE_PROJECT = os.environ.get("FIRESTORE_PROJECT", "transparenciabr")


class FirestoreService:
    """
    TODO(maestro): implementar todos os métodos usando firebase_admin.firestore.
    Inicializar via app.state.fs_client no lifespan do main.py.
    """

    def __init__(self, client=None):
        # TODO(maestro): self.db = client or firestore.AsyncClient(project=FIRESTORE_PROJECT)
        self.db = client

    async def get_creditos(self, uid: str) -> int:
        """
        Lê saldo de créditos do usuário.
        Returns: int (saldo atual), -1 se usuário não encontrado.

        TODO(maestro): doc = await self.db.collection('usuarios').document(uid).get()
        return doc.to_dict().get('creditos', 0) if doc.exists else -1
        """
        raise NotImplementedError("FirestoreService.get_creditos — TODO(maestro)")

    async def debitar_credito(self, uid: str, custo: int, acao: str) -> bool:
        """
        Debita créditos do usuário via Admin SDK (transação atômica).

        IMPORTANTE: usa Admin SDK (não SDK web), portanto bypassa as regras
        Firestore de cliente — mas registra em lgpd_audit_radar para auditoria.

        Args:
            uid: Firebase UID
            custo: número de créditos a debitar
            acao: descrição da ação (para log)

        Returns: True se débito bem-sucedido, False se saldo insuficiente

        TODO(maestro): usar transação Firestore para atomicidade:
            @firestore.async_transactional
            async def debit_transaction(transaction, ref):
                snap = await ref.get(transaction=transaction)
                saldo = snap.get('creditos')
                if saldo < custo:
                    raise ValueError("Saldo insuficiente")
                transaction.update(ref, {'creditos': saldo - custo, 'updated_at': SERVER_TIMESTAMP})
        """
        raise NotImplementedError("FirestoreService.debitar_credito — TODO(maestro)")

    async def create_alerta(self, uid: str, alerta_id: str, payload: dict) -> None:
        """
        Cria documento de alerta no Firestore.

        Path: radar_juridico_alertas/{uid}/watches/{alerta_id}

        TODO(maestro): await self.db.collection('radar_juridico_alertas')
            .document(uid).collection('watches').document(alerta_id).set(payload)
        """
        raise NotImplementedError("FirestoreService.create_alerta — TODO(maestro)")

    async def list_alertas(self, uid: str, status: str = "") -> list[dict]:
        """
        Lista alertas do usuário.

        TODO(maestro): query com filtro opcional de status.
        Retornar lista de dicts com campos do alerta.
        """
        raise NotImplementedError("FirestoreService.list_alertas — TODO(maestro)")

    async def cancel_alerta(self, uid: str, alerta_id: str) -> bool:
        """
        Cancela alerta (status → INATIVO).
        Verifica que uid == alerta.uid (anti-IDOR).

        TODO(maestro): verificar propriedade antes de atualizar.
        """
        raise NotImplementedError("FirestoreService.cancel_alerta — TODO(maestro)")
