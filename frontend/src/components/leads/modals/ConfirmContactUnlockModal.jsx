/**
 * @file ConfirmContactUnlockModal.jsx
 * @description Modal de confirmação para desbloqueio de contatos (Paywall 1).
 *
 * Exibe:
 *   - Resumo do lead (nome anonimizado)
 *   - Custo em créditos e saldo resultante
 *   - Aviso sobre verificação gratuita no PJe
 *   - Botões Confirmar / Cancelar
 *
 * Props:
 * @param {boolean}  isOpen            - Controla visibilidade do modal
 * @param {Function} onClose           - Callback ao fechar sem confirmar
 * @param {Function} onConfirm         - Callback ao confirmar (inicia loading no card)
 * @param {string}   nomeAnonimizado   - Ex: "M.A.C. - SP"
 * @param {number}   custoCreditos     - Créditos que serão debitados
 * @param {number}   saldoAtual        - Créditos disponíveis antes da operação
 * @param {boolean}  [isLoading=false] - Bloqueia botão durante requisição
 */

import React, { useEffect, useRef } from 'react';

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: Function,
 *   onConfirm: Function,
 *   nomeAnonimizado: string,
 *   custoCreditos: number,
 *   saldoAtual: number,
 *   isLoading?: boolean
 * }} props
 */
export function ConfirmContactUnlockModal({
  isOpen,
  onClose,
  onConfirm,
  nomeAnonimizado,
  custoCreditos,
  saldoAtual,
  isLoading = false,
}) {
  const dialogRef    = useRef(null);
  const saldoApos    = saldoAtual - custoCreditos;
  const semCreditos  = saldoApos < 0;

  // Foco no modal ao abrir; fechar com Escape
  useEffect(() => {
    if (!isOpen) return;
    const el = dialogRef.current;
    if (el) el.focus();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  return (
    /* Overlay */
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-contatos-titulo"
        aria-describedby="modal-contatos-descricao"
        tabIndex={-1}
        className="
          relative w-full max-w-md
          bg-white dark:bg-slate-900
          border border-slate-200 dark:border-slate-700
          rounded-2xl shadow-xl
          p-6 outline-none
          focus-visible:ring-2 focus-visible:ring-slate-400
        "
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between mb-4">
          <h2
            id="modal-contatos-titulo"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight"
          >
            Confirmar desbloqueio de contatos
          </h2>
          <button
            type="button"
            aria-label="Fechar modal"
            disabled={isLoading}
            onClick={onClose}
            className="
              ml-4 p-1 rounded-lg
              text-slate-400 hover:text-slate-600
              dark:text-slate-500 dark:hover:text-slate-300
              hover:bg-slate-100 dark:hover:bg-slate-800
              transition-colors disabled:opacity-40
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
            "
          >
            <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Descrição principal */}
        <p
          id="modal-contatos-descricao"
          className="text-sm text-slate-600 dark:text-slate-400 mb-5"
        >
          Esta ação irá desbloquear os dados de contato do lead e debitar créditos da sua conta.
        </p>

        {/* Card de breakdown */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 mb-4 space-y-2">
          <dl className="space-y-1">
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Lead</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">{nomeAnonimizado}</dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Custo</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">
                {custoCreditos} crédito{custoCreditos !== 1 ? 's' : ''}
              </dd>
            </div>
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Saldo atual</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200">{saldoAtual} créditos</dd>
            </div>
            <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" aria-hidden="true" />
            <div className="flex justify-between text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Saldo após</dt>
              <dd className={`font-semibold ${semCreditos ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200'}`}>
                {saldoApos} créditos
              </dd>
            </div>
          </dl>
        </div>

        {/* Aviso PJe */}
        <div
          role="note"
          className="
            flex gap-3 rounded-lg
            bg-amber-50 dark:bg-amber-950/30
            border border-amber-200 dark:border-amber-800
            p-3 mb-5
          "
        >
          <svg
            aria-hidden="true"
            className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            <strong>Verificação gratuita no PJe:</strong> antes de cobrar, o sistema verifica
            automaticamente se este lead já possui processo posterior. Se houver,{' '}
            <strong>nenhum crédito será debitado</strong> e o lead será marcado como desqualificado.
          </p>
        </div>

        {/* Botões */}
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            className="
              flex-1 px-4 py-2.5 rounded-xl
              text-sm font-medium
              text-slate-700 dark:text-slate-300
              bg-slate-100 dark:bg-slate-800
              hover:bg-slate-200 dark:hover:bg-slate-700
              border border-slate-200 dark:border-slate-700
              transition-colors disabled:opacity-40
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
            "
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isLoading || semCreditos}
            onClick={onConfirm}
            aria-label={`Confirmar desbloqueio de contatos de ${nomeAnonimizado}`}
            className="
              flex-1 px-4 py-2.5 rounded-xl
              text-sm font-semibold
              text-white
              bg-slate-800 dark:bg-slate-100 dark:text-slate-900
              hover:bg-slate-700 dark:hover:bg-white
              border border-transparent
              transition-colors disabled:opacity-40 disabled:cursor-not-allowed
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
            "
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  aria-hidden="true"
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Processando...
              </span>
            ) : (
              `Confirmar · ${custoCreditos} crédito${custoCreditos !== 1 ? 's' : ''}`
            )}
          </button>
        </div>

        {/* Aviso de créditos insuficientes */}
        {semCreditos && (
          <p role="alert" className="mt-3 text-xs text-center text-red-600 dark:text-red-400">
            Saldo insuficiente para esta operação. Adquira mais créditos para continuar.
          </p>
        )}
      </div>
    </div>
  );
}

export default ConfirmContactUnlockModal;
