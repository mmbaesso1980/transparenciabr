/**
 * @file leadToasts.js
 * @description Helpers de toast para o fluxo LeadCardPro.
 *
 * Utiliza react-hot-toast. Caso o projeto já use outra lib de toast,
 * substituir os imports e adaptar as chamadas internas.
 *
 * Instalar se necessário:
 *   npm install react-hot-toast
 *
 * Adicionar ao root da aplicação (App.jsx ou main.jsx):
 *   import { Toaster } from 'react-hot-toast';
 *   // dentro do JSX: <Toaster position="top-right" />
 */

import toast from 'react-hot-toast';

// ─── Configurações padrão ────────────────────────────────────────────────────

const DURACAO_SUCESSO = 4000;
const DURACAO_AVISO   = 5000;
const DURACAO_ERRO    = 6000;

// ─── Contatos ────────────────────────────────────────────────────────────────

/**
 * Toast de sucesso após desbloqueio de contatos.
 * @param {string} nomeAnonimizado - Ex: "M.A.C. - SP"
 */
export function toastContatosDesbloqueados(nomeAnonimizado) {
  toast.success(
    `Contatos de ${nomeAnonimizado} liberados com sucesso.`,
    {
      duration: DURACAO_SUCESSO,
      ariaProps: { role: 'status', 'aria-live': 'polite' },
    }
  );
}

/**
 * Toast de aviso: lead desqualificado pelo PJe, sem cobrança.
 * @param {string} nomeAnonimizado
 */
export function toastLeadDesqualificadoPJe(nomeAnonimizado) {
  toast(
    `Lead ${nomeAnonimizado} desqualificado — processo posterior identificado no PJe. Nenhum crédito foi debitado.`,
    {
      duration:  DURACAO_AVISO,
      icon:      '⚠️',
      style:     {
        background: '#fefce8',
        color:      '#713f12',
        border:     '1px solid #fde68a',
      },
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }
  );
}

/**
 * Toast de erro genérico ao tentar abrir contatos.
 */
export function toastErroAbrirContatos() {
  toast.error(
    'Não foi possível liberar os contatos. Tente novamente ou entre em contato com o suporte.',
    {
      duration: DURACAO_ERRO,
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }
  );
}

// ─── Petição ─────────────────────────────────────────────────────────────────

/**
 * Toast de sucesso após geração de petição.
 */
export function toastPeticaoGerada() {
  toast.success(
    'Petição gerada com sucesso. O download foi aberto em nova aba.',
    {
      duration:  DURACAO_SUCESSO,
      ariaProps: { role: 'status', 'aria-live': 'polite' },
    }
  );
}

/**
 * Toast de erro genérico ao gerar petição.
 */
export function toastErroGerarPeticao() {
  toast.error(
    'Falha ao gerar a petição. Verifique sua conexão e tente novamente.',
    {
      duration:  DURACAO_ERRO,
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }
  );
}

/**
 * Toast de aviso: link da petição expirado.
 */
export function toastLinkPeticaoExpirado() {
  toast(
    'O link de download expirou. Gere uma nova versão da petição.',
    {
      duration:  DURACAO_AVISO,
      icon:      '⚠️',
      style:     {
        background: '#fefce8',
        color:      '#713f12',
        border:     '1px solid #fde68a',
      },
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }
  );
}

// ─── Créditos ─────────────────────────────────────────────────────────────────

/**
 * Toast de erro: créditos insuficientes (fallback sem modal).
 * Normalmente o modal InsufficientCreditsModal é exibido; este toast é reserva.
 */
export function toastCreditosInsuficientes() {
  toast.error(
    'Créditos insuficientes para esta operação.',
    {
      duration:  DURACAO_ERRO,
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }
  );
}

// ─── Genérico ─────────────────────────────────────────────────────────────────

/**
 * Toast de erro genérico, com mensagem customizável.
 * @param {string} [mensagem]
 */
export function toastErroGenerico(mensagem) {
  toast.error(
    mensagem ?? 'Ocorreu um erro inesperado. Tente novamente.',
    {
      duration:  DURACAO_ERRO,
      ariaProps: { role: 'alert', 'aria-live': 'assertive' },
    }
  );
}
