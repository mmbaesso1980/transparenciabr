/**
 * @file GeneratePetitionModal.jsx
 * @description Modal de confirmação para geração de petição (Paywall 2).
 *
 * Exibe:
 *   - Dados pré-preenchidos do advogado logado (OAB, CNPJ)
 *   - Campos editáveis para revisão antes de confirmar
 *   - Custo em créditos e saldo resultante
 *   - Botões Gerar Petição / Cancelar
 *
 * Props:
 * @param {boolean}  isOpen           - Controla visibilidade
 * @param {Function} onClose          - Fechar sem confirmar
 * @param {Function} onConfirm        - Callback com { oab, cnpj, nomeAdvogado }
 * @param {string}   nomeAnonimizado  - Ex: "M.A.C. - SP"
 * @param {number}   custoCreditos    - Créditos que serão debitados
 * @param {number}   saldoAtual       - Créditos disponíveis antes da operação
 * @param {Object}   advogado         - { oab, cnpj, nome } pré-preenchidos do auth
 * @param {boolean}  [isLoading=false]
 */

import React, { useState, useEffect, useRef } from 'react';

/**
 * @param {{
 *   isOpen: boolean,
 *   onClose: Function,
 *   onConfirm: Function,
 *   nomeAnonimizado: string,
 *   custoCreditos: number,
 *   saldoAtual: number,
 *   advogado: { oab: string, cnpj: string, nome: string },
 *   isLoading?: boolean
 * }} props
 */
export function GeneratePetitionModal({
  isOpen,
  onClose,
  onConfirm,
  nomeAnonimizado,
  custoCreditos,
  saldoAtual,
  advogado,
  isLoading = false,
}) {
  const dialogRef = useRef(null);
  const primeiroInput = useRef(null);

  const [form, setForm] = useState({
    nome:  advogado?.nome  ?? '',
    oab:   advogado?.oab   ?? '',
    cnpj:  advogado?.cnpj  ?? '',
  });

  // Sincroniza form quando advogado muda (ex: carregamento assíncrono do perfil)
  useEffect(() => {
    if (advogado) {
      setForm({
        nome: advogado.nome  ?? '',
        oab:  advogado.oab   ?? '',
        cnpj: advogado.cnpj  ?? '',
      });
    }
  }, [advogado]);

  // Foco e Escape
  useEffect(() => {
    if (!isOpen) return;
    setTimeout(() => primeiroInput.current?.focus(), 50);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  const saldoApos   = saldoAtual - custoCreditos;
  const semCreditos = saldoApos < 0;
  const camposVazios = !form.oab.trim() || !form.cnpj.trim() || !form.nome.trim();

  const handleChange = (campo) => (e) =>
    setForm((prev) => ({ ...prev, [campo]: e.target.value }));

  const handleConfirm = () => {
    if (!semCreditos && !camposVazios && !isLoading) onConfirm(form);
  };

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !isLoading) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-peticao-titulo"
        aria-describedby="modal-peticao-descricao"
        tabIndex={-1}
        className="
          relative w-full max-w-lg
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
            id="modal-peticao-titulo"
            className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight"
          >
            Gerar petição inicial
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

        <p
          id="modal-peticao-descricao"
          className="text-sm text-slate-600 dark:text-slate-400 mb-5"
        >
          Confirme ou edite os dados do escritório. A petição será gerada com IA e associada ao lead{' '}
          <strong className="text-slate-800 dark:text-slate-200">{nomeAnonimizado}</strong>.
        </p>

        {/* Formulário de dados do advogado */}
        <fieldset className="mb-5 space-y-3" disabled={isLoading}>
          <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            Dados do escritório
          </legend>

          {/* Nome */}
          <div>
            <label
              htmlFor="adv-nome"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              Nome do advogado responsável
            </label>
            <input
              ref={primeiroInput}
              id="adv-nome"
              type="text"
              value={form.nome}
              onChange={handleChange('nome')}
              placeholder="Ex: Dr. João da Silva"
              aria-required="true"
              className="
                w-full px-3 py-2 rounded-lg text-sm
                bg-white dark:bg-slate-800
                border border-slate-200 dark:border-slate-700
                text-slate-900 dark:text-slate-100
                placeholder-slate-400 dark:placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-slate-400
                disabled:opacity-50
              "
            />
          </div>

          {/* OAB */}
          <div>
            <label
              htmlFor="adv-oab"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              OAB
            </label>
            <input
              id="adv-oab"
              type="text"
              value={form.oab}
              onChange={handleChange('oab')}
              placeholder="Ex: SP123456"
              aria-required="true"
              className="
                w-full px-3 py-2 rounded-lg text-sm
                bg-white dark:bg-slate-800
                border border-slate-200 dark:border-slate-700
                text-slate-900 dark:text-slate-100
                placeholder-slate-400 dark:placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-slate-400
                disabled:opacity-50
              "
            />
          </div>

          {/* CNPJ */}
          <div>
            <label
              htmlFor="adv-cnpj"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
            >
              CNPJ do escritório
            </label>
            <input
              id="adv-cnpj"
              type="text"
              value={form.cnpj}
              onChange={handleChange('cnpj')}
              placeholder="Ex: 00.000.000/0001-00"
              aria-required="true"
              className="
                w-full px-3 py-2 rounded-lg text-sm
                bg-white dark:bg-slate-800
                border border-slate-200 dark:border-slate-700
                text-slate-900 dark:text-slate-100
                placeholder-slate-400 dark:placeholder-slate-500
                focus:outline-none focus:ring-2 focus:ring-slate-400
                disabled:opacity-50
              "
            />
          </div>
        </fieldset>

        {/* Resumo de custo */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 mb-5">
          <dl className="space-y-1">
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

        {/* Etapas informativas (processo de geração) */}
        <div
          role="note"
          className="
            rounded-lg bg-slate-50 dark:bg-slate-800/50
            border border-slate-200 dark:border-slate-700
            p-3 mb-5
          "
        >
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Processo de geração (estimativa):
          </p>
          <ol className="space-y-1">
            {[
              ['1–3 s',   'Buscando dados públicos do CNPJ'],
              ['10–30 s', 'Gerando tese jurídica com IA'],
              ['2–5 s',   'Renderizando documento'],
            ].map(([tempo, etapa]) => (
              <li key={etapa} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex-shrink-0 w-12 font-mono text-slate-400 dark:text-slate-500">{tempo}</span>
                <span>{etapa}</span>
              </li>
            ))}
          </ol>
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
            disabled={isLoading || semCreditos || camposVazios}
            onClick={handleConfirm}
            aria-label="Confirmar geração de petição"
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
                Gerando petição...
              </span>
            ) : (
              `Gerar petição · ${custoCreditos} crédito${custoCreditos !== 1 ? 's' : ''}`
            )}
          </button>
        </div>

        {semCreditos && (
          <p role="alert" className="mt-3 text-xs text-center text-red-600 dark:text-red-400">
            Saldo insuficiente para gerar a petição. Adquira mais créditos.
          </p>
        )}
      </div>
    </div>
  );
}

export default GeneratePetitionModal;
