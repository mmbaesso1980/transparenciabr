/**
 * @file InsufficientCreditsModal.jsx
 * @description Modal exibido quando a Cloud Function retorna erro 402 (créditos insuficientes).
 *
 * Props:
 * @param {boolean}   isOpen         - Controla visibilidade
 * @param {Function}  onClose        - Fechar o modal
 * @param {Function}  onComprar      - Redireciona para página de compra de créditos
 * @param {number}    [saldoAtual]   - Créditos disponíveis (opcional, exibido se passado)
 * @param {number}    [custoAcao]    - Créditos necessários para a ação (opcional)
 */

import React, { useEffect, useRef } from 'react';

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: Function,
 *   onComprar: Function,
 *   saldoAtual?: number,
 *   custoAcao?: number
 * }} props
 */
export function InsufficientCreditsModal({
  isOpen,
  onClose,
  onComprar,
  saldoAtual,
  custoAcao,
}) {
  const dialogRef  = useRef(null);
  const btnComprar = useRef(null);

  // Foco e Escape
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => btnComprar.current?.focus(), 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const falta =
    saldoAtual !== undefined && custoAcao !== undefined
      ? Math.max(0, custoAcao - saldoAtual)
      : null;

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="modal-creditos-titulo"
        aria-describedby="modal-creditos-descricao"
        tabIndex={-1}
        className="
          relative w-full max-w-sm
          bg-white dark:bg-slate-900
          border border-slate-200 dark:border-slate-700
          rounded-2xl shadow-xl
          p-6 outline-none
        "
      >
        {/* Ícone ilustrativo */}
        <div
          aria-hidden="true"
          className="
            mx-auto mb-4 w-12 h-12 rounded-full
            bg-amber-100 dark:bg-amber-950/40
            flex items-center justify-center
          "
        >
          <svg
            className="w-6 h-6 text-amber-600 dark:text-amber-400"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
        </div>

        <h2
          id="modal-creditos-titulo"
          className="text-center text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2"
        >
          Créditos insuficientes
        </h2>

        <p
          id="modal-creditos-descricao"
          className="text-center text-sm text-slate-600 dark:text-slate-400 mb-5"
        >
          {falta !== null
            ? `Você precisa de mais ${falta} crédito${falta !== 1 ? 's' : ''} para realizar esta operação.`
            : 'Seu saldo atual não é suficiente para realizar esta operação.'}
          {' '}Adquira créditos adicionais para continuar.
        </p>

        {/* Saldo atual (se disponível) */}
        {saldoAtual !== undefined && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 mb-5">
            <dl className="space-y-1">
              {custoAcao !== undefined && (
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">Custo da operação</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200">{custoAcao} créditos</dd>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <dt className="text-slate-500 dark:text-slate-400">Seu saldo</dt>
                <dd className="font-semibold text-red-600 dark:text-red-400">{saldoAtual} créditos</dd>
              </div>
              {falta !== null && (
                <div className="flex justify-between text-sm">
                  <dt className="text-slate-500 dark:text-slate-400">Faltam</dt>
                  <dd className="font-semibold text-red-600 dark:text-red-400">{falta} créditos</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Botões */}
        <div className="flex flex-col gap-2">
          <button
            ref={btnComprar}
            type="button"
            onClick={onComprar}
            aria-label="Ir para a página de compra de créditos"
            className="
              w-full px-4 py-2.5 rounded-xl
              text-sm font-semibold
              text-white
              bg-slate-800 dark:bg-slate-100 dark:text-slate-900
              hover:bg-slate-700 dark:hover:bg-white
              transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
            "
          >
            Adquirir créditos
          </button>

          <button
            type="button"
            onClick={onClose}
            className="
              w-full px-4 py-2.5 rounded-xl
              text-sm font-medium
              text-slate-700 dark:text-slate-300
              bg-slate-100 dark:bg-slate-800
              hover:bg-slate-200 dark:hover:bg-slate-700
              transition-colors
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
            "
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

export default InsufficientCreditsModal;
