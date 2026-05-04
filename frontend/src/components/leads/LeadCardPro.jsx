/**
 * @file LeadCardPro.jsx
 * @description Componente principal de lead para a página /radar-legal — TransparênciaBR.
 *
 * Gerencia 3 estados de exibição:
 *   BASICO    → dados anonimizados + botão [Abrir Contatos]
 *   CONTATOS  → contatos desbloqueados + botão [Gerar Petição]
 *   PETICAO   → petição gerada + countdown + histórico
 *
 * Dependências externas:
 *   - react-hot-toast  (notificações)
 *   - firebase/functions (Cloud Functions openContactBigData, generateInitialPetition)
 *   - firebase/firestore (via hooks internos)
 *
 * @see hooks/useLeadUnlockStatus.js
 * @see hooks/useUserCredits.js
 * @see modals/ConfirmContactUnlockModal.jsx
 * @see modals/GeneratePetitionModal.jsx
 * @see modals/InsufficientCreditsModal.jsx
 * @see toasts/leadToasts.js
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { httpsCallable, getFunctions }                     from 'firebase/functions';
import { getFirebaseApp }                                  from '../../lib/firebase.js';

import { useLeadUnlockStatus, LEAD_STATUS } from '../../hooks/leads/useLeadUnlockStatus.js';
import { useUserCredits }                   from '../../hooks/leads/useUserCredits.js';
import { ConfirmContactUnlockModal }        from './modals/ConfirmContactUnlockModal.jsx';
import { GeneratePetitionModal }            from './modals/GeneratePetitionModal.jsx';
import { InsufficientCreditsModal }         from './modals/InsufficientCreditsModal.jsx';
import {
  toastContatosDesbloqueados,
  toastLeadDesqualificadoPJe,
  toastErroAbrirContatos,
  toastPeticaoGerada,
  toastErroGerarPeticao,
  toastErroGenerico,
} from '../../lib/leadToasts.js';

// ─── Cloud Functions (lazy: instância só quando o app Firebase existir) ──────

function getCloudFunctions() {
  const app = getFirebaseApp();
  return app ? getFunctions(app) : null;
}

const openContact = (...args) => {
  const fn = getCloudFunctions();
  if (!fn) throw new Error('Firebase não inicializado');
  return httpsCallable(fn, 'openContactBigData')(...args);
};
const generatePetition = (...args) => {
  const fn = getCloudFunctions();
  if (!fn) throw new Error('Firebase não inicializado');
  return httpsCallable(fn, 'generateInitialPetition')(...args);
};

// ─── Constantes de custo (ajustar conforme regra de negócio) ─────────────────

const CUSTO_CONTATOS = 10;
const CUSTO_PETICAO  = 25;

// ─── Textos rotativos durante loading ────────────────────────────────────────

const TEXTOS_LOADING_CONTATOS = [
  'Verificando PJe...',
  'Buscando contatos...',
  'Pronto',
];

const TEXTOS_LOADING_PETICAO = [
  'Buscando dados públicos do CNPJ...',
  'Gerando tese jurídica com IA...',
  'Renderizando documento...',
];

// ─── Tempo de expiração do link de petição (15 min em ms) ────────────────────

const EXPIRACAO_LINK_MS = 15 * 60 * 1000;

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Formata data para DD/MM/YYYY.
 * @param {Date|string|null} data
 * @returns {string}
 */
function formatarData(data) {
  if (!data) return '—';
  const d = data instanceof Date ? data : new Date(data);
  return d.toLocaleDateString('pt-BR');
}

/**
 * Formata segundos como MM:SS.
 * @param {number} segundos
 * @returns {string}
 */
function formatarContagem(segundos) {
  const m = String(Math.floor(segundos / 60)).padStart(2, '0');
  const s = String(segundos % 60).padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Sub-componente: Badge de créditos ───────────────────────────────────────

/**
 * @param {{ valor: number }} props
 */
function CreditoBadge({ valor }) {
  return (
    <span
      aria-label={`${valor} crédito${valor !== 1 ? 's' : ''}`}
      className="
        inline-flex items-center gap-1
        px-2 py-0.5 rounded-full
        text-xs font-medium
        bg-slate-100 dark:bg-slate-800
        text-slate-600 dark:text-slate-400
        border border-slate-200 dark:border-slate-700
      "
    >
      <svg aria-hidden="true" className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 1.5A6.5 6.5 0 1110 16.5 6.5 6.5 0 0110 3.5zM9.25 7v2.25H7v1.5h2.25V13h1.5v-2.25H13v-1.5h-2.25V7h-1.5z" />
      </svg>
      {valor}
    </span>
  );
}

// ─── Sub-componente: Barra de score ──────────────────────────────────────────

/**
 * @param {{ valor: number }} props — valor entre 0-100
 */
function ScoreBar({ valor }) {
  const corBarra =
    valor >= 70 ? 'bg-emerald-500'
    : valor >= 40 ? 'bg-amber-500'
    : 'bg-red-500';

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-slate-500 dark:text-slate-400">Score de qualificação</span>
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{valor}/100</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={valor}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Score de qualificação: ${valor} de 100`}
        className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${corBarra}`}
          style={{ width: `${valor}%` }}
        />
      </div>
    </div>
  );
}

// ─── Sub-componente: Tag/pill ─────────────────────────────────────────────────

/**
 * @param {{ label: string, variant?: 'default'|'urgencia-alta'|'urgencia-media'|'urgencia-baixa' }} props
 */
function Tag({ label, variant = 'default' }) {
  const estilos = {
    'default':       'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
    'urgencia-alta': 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',
    'urgencia-media':'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    'urgencia-baixa':'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700',
  };

  return (
    <span
      className={`
        inline-flex items-center px-2 py-0.5 rounded-full
        text-xs font-medium border
        ${estilos[variant] ?? estilos['default']}
      `}
    >
      {label}
    </span>
  );
}

// ─── Sub-componente: Status PJe ───────────────────────────────────────────────

/**
 * @param {{ status: 'limpo'|'pendente'|'desqualificado' }} props
 */
function StatusPJe({ status }) {
  const config = {
    limpo:          { icone: '✅', texto: 'Sem processo posterior', cor: 'text-emerald-700 dark:text-emerald-400' },
    pendente:       { icone: '⚠️', texto: 'Verificação pendente',   cor: 'text-amber-700 dark:text-amber-400'   },
    desqualificado: { icone: '❌', texto: 'Já tem processo (lead desqualificado)', cor: 'text-red-700 dark:text-red-400' },
  };

  const { icone, texto, cor } = config[status] ?? config['pendente'];

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden="true">{icone}</span>
      <span className={`text-xs font-medium ${cor}`}>{texto}</span>
    </div>
  );
}

// ─── Sub-componente: Texto de loading rotativo ────────────────────────────────

/**
 * @param {{ textos: string[], ativo: boolean }} props
 */
function TextoRotativo({ textos, ativo }) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (!ativo) { setIndice(0); return; }

    const intervalo = setInterval(() => {
      setIndice((i) => Math.min(i + 1, textos.length - 1));
    }, 2500);

    return () => clearInterval(intervalo);
  }, [ativo, textos.length]);

  return (
    <span
      aria-live="polite"
      aria-label={textos[indice]}
      className="inline-flex items-center gap-2"
    >
      <svg
        aria-hidden="true"
        className="w-4 h-4 animate-spin flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      {textos[indice]}
    </span>
  );
}

// ─── Sub-componente: Countdown do link de petição ────────────────────────────

/**
 * @param {{ expiraEm: Date, onExpirado: Function }} props
 */
function CountdownLink({ expiraEm, onExpirado }) {
  const calcularSegundos = () =>
    Math.max(0, Math.floor((expiraEm.getTime() - Date.now()) / 1000));

  const [segundos, setSegundos] = useState(calcularSegundos);
  const chamouExpiracao = useRef(false);

  useEffect(() => {
    chamouExpiracao.current = false;
    const timer = setInterval(() => {
      const restante = calcularSegundos();
      setSegundos(restante);
      if (restante === 0 && !chamouExpiracao.current) {
        chamouExpiracao.current = true;
        onExpirado?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiraEm]);

  const estaExpirado  = segundos === 0;
  const corContagem   = estaExpirado ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400';

  return (
    <span
      aria-live="polite"
      aria-label={
        estaExpirado
          ? 'Link de download expirado'
          : `Link expira em ${formatarContagem(segundos)}`
      }
      className={`text-xs font-mono ${corContagem}`}
    >
      {estaExpirado ? 'Link expirado' : `Expira em ${formatarContagem(segundos)}`}
    </span>
  );
}

// ─── Componente principal: LeadCardPro ───────────────────────────────────────

/**
 * @typedef {Object} LeadData
 * @property {string}   id                  - ID único do lead (Firestore/BQ)
 * @property {string}   nomeAnonimizado      - Ex: "M.A.C. - SP"
 * @property {string}   faixaIdade          - Ex: "35–40"
 * @property {string}   especieBeneficio    - Ex: "41 – Aposentadoria por Idade"
 * @property {string}   motivoIndeferimento - Ex: "Falta de qualidade de segurado"
 * @property {string}   dataIndeferimento   - ISO string ou Date
 * @property {number}   scoreQualificacao   - 0-100
 * @property {string}   teseJuridica        - Resumo gerado por IA (_g_tese_juridica)
 * @property {string[]} tags                - Ex: ["PCD - Idade"]
 * @property {'alta'|'media'|'baixa'} urgencia
 * @property {string}   [nomeCompleto]
 * @property {string[]} [telefones]
 * @property {string[]} [emails]
 * @property {string}   [enderecoCompleto]
 * @property {'limpo'|'pendente'|'desqualificado'} [statusPJe]
 */

/**
 * @typedef {Object} AdvogadoData
 * @property {string} oab
 * @property {string} cnpj
 * @property {string} nome
 */

/**
 * Props do LeadCardPro.
 * @param {LeadData}     lead              - Dados do lead
 * @param {AdvogadoData} advogado          - Dados do advogado logado
 * @param {Function}     [onComprarCreditos] - Redirecionar para compra de créditos
 */
export function LeadCardPro({ lead, advogado, onComprarCreditos }) {
  // ── Hooks de estado ─────────────────────────────────────────────────────────
  const { status: statusInicial, unlockData, refetch: refetchStatus } =
    useLeadUnlockStatus(lead.id, advogado?.oab);

  const { credits: saldo, deductOptimistic } = useUserCredits();

  // Estado derivado controlado localmente (após ações do usuário)
  const [estadoCard, setEstadoCard] = useState('loading');

  // Dados de contato (recebidos da Cloud Function após unlock)
  const [dadosContato, setDadosContato]       = useState(null);
  const [peticaoUrl, setPeticaoUrl]           = useState(null);
  const [peticaoExpiraEm, setPeticaoExpiraEm] = useState(null);
  const [historicoPeticoes, setHistoricoPeticoes] = useState([]);
  const [mostrarHistorico, setMostrarHistorico]   = useState(false);

  // Loading / modais
  const [loadingContatos, setLoadingContatos]     = useState(false);
  const [loadingPeticao, setLoadingPeticao]       = useState(false);
  const [modalContatosOpen, setModalContatosOpen] = useState(false);
  const [modalPeticaoOpen, setModalPeticaoOpen]   = useState(false);
  const [modalCreditosOpen, setModalCreditosOpen] = useState(false);
  const [creditosModalCusto, setCreditosModalCusto] = useState(null);

  // Sincroniza estado do card com resultado do hook
  useEffect(() => {
    if (statusInicial === 'loading') return;

    if (statusInicial === LEAD_STATUS.PETICAO && unlockData) {
      setEstadoCard(LEAD_STATUS.PETICAO);
      setDadosContato(unlockData.contatos ?? null);
      setHistoricoPeticoes(unlockData.peticoes ?? []);
      // Última petição como URL ativa (se ainda não expirou os 15 min não é rastreado aqui)
      const ultima = unlockData.peticoes?.[unlockData.peticoes.length - 1];
      if (ultima?.url) {
        setPeticaoUrl(ultima.url);
        setPeticaoExpiraEm(ultima.expiraEm instanceof Date
          ? ultima.expiraEm
          : ultima.expiraEm?.toDate?.() ?? null);
      }
    } else if (statusInicial === LEAD_STATUS.CONTATOS && unlockData) {
      setEstadoCard(LEAD_STATUS.CONTATOS);
      setDadosContato(unlockData.contatos ?? null);
    } else {
      setEstadoCard(LEAD_STATUS.BASICO);
    }
  }, [statusInicial, unlockData]);

  // ── Handlers: Contatos ──────────────────────────────────────────────────────

  const handleAbrirContatosClick = () => {
    if ((saldo ?? 0) < CUSTO_CONTATOS) {
      setCreditosModalCusto(CUSTO_CONTATOS);
      setModalCreditosOpen(true);
      return;
    }
    setModalContatosOpen(true);
  };

  const handleConfirmarContatos = useCallback(async () => {
    setModalContatosOpen(false);
    setLoadingContatos(true);

    try {
      const resultado = await openContact({ leadId: lead.id, oab: advogado.oab });
      const dados     = resultado.data;

      // Dedução otimista enquanto Firestore atualiza
      deductOptimistic(CUSTO_CONTATOS);

      setDadosContato(dados.contatos);
      setEstadoCard(LEAD_STATUS.CONTATOS);
      toastContatosDesbloqueados(lead.nomeAnonimizado);
      refetchStatus();
    } catch (err) {
      const code = err?.details?.code ?? err?.code;

      if (code === 412 || err?.message?.includes('412')) {
        toastLeadDesqualificadoPJe(lead.nomeAnonimizado);
        refetchStatus(); // Atualiza statusPJe no card
      } else if (code === 402 || err?.message?.includes('402')) {
        setCreditosModalCusto(CUSTO_CONTATOS);
        setModalCreditosOpen(true);
      } else {
        toastErroAbrirContatos();
      }
    } finally {
      setLoadingContatos(false);
    }
  }, [lead.id, lead.nomeAnonimizado, advogado.oab, deductOptimistic, refetchStatus]);

  // ── Handlers: Petição ───────────────────────────────────────────────────────

  const handleGerarPeticaoClick = () => {
    if ((saldo ?? 0) < CUSTO_PETICAO) {
      setCreditosModalCusto(CUSTO_PETICAO);
      setModalCreditosOpen(true);
      return;
    }
    setModalPeticaoOpen(true);
  };

  const handleConfirmarPeticao = useCallback(async (dadosAdvogado) => {
    setModalPeticaoOpen(false);
    setLoadingPeticao(true);

    try {
      const resultado = await generatePetition({
        leadId: lead.id,
        oab:    dadosAdvogado.oab,
        cnpj:   dadosAdvogado.cnpj,
        nome:   dadosAdvogado.nome,
      });

      const dados = resultado.data;

      deductOptimistic(CUSTO_PETICAO);

      const expira = new Date(Date.now() + EXPIRACAO_LINK_MS);
      setPeticaoUrl(dados.url);
      setPeticaoExpiraEm(expira);
      setEstadoCard(LEAD_STATUS.PETICAO);

      setHistoricoPeticoes((prev) => [
        ...prev,
        { url: dados.url, geradaEm: new Date(), expiraEm: expira },
      ]);

      window.open(dados.url, '_blank', 'noopener,noreferrer');
      toastPeticaoGerada();
      refetchStatus();
    } catch (err) {
      const code = err?.details?.code ?? err?.code;

      if (code === 402 || err?.message?.includes('402')) {
        setCreditosModalCusto(CUSTO_PETICAO);
        setModalCreditosOpen(true);
      } else {
        toastErroGerarPeticao();
      }
    } finally {
      setLoadingPeticao(false);
    }
  }, [lead.id, deductOptimistic, refetchStatus]);

  const handleLinkExpirado = useCallback(() => {
    setPeticaoUrl(null);
  }, []);

  const handleBaixarPeticao = () => {
    if (peticaoUrl) window.open(peticaoUrl, '_blank', 'noopener,noreferrer');
  };

  // ── Renderização: card em loading inicial ───────────────────────────────────

  if (estadoCard === 'loading') {
    return (
      <div
        aria-label="Carregando lead..."
        aria-busy="true"
        className="
          bg-white dark:bg-slate-900
          border border-slate-200 dark:border-slate-800
          rounded-xl p-5 shadow-sm
          animate-pulse
        "
      >
        <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-700 rounded mb-3" />
        <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800 rounded mb-2" />
        <div className="h-3 w-2/3 bg-slate-100 dark:bg-slate-800 rounded mb-5" />
        <div className="h-8 w-full bg-slate-100 dark:bg-slate-800 rounded" />
      </div>
    );
  }

  // ── Dados para exibição ─────────────────────────────────────────────────────

  const contatos = dadosContato ?? (lead.statusPJe ? {
    statusPJe:       lead.statusPJe,
    nomeCompleto:    lead.nomeCompleto,
    telefones:       lead.telefones ?? [],
    emails:          lead.emails    ?? [],
    enderecoCompleto: lead.enderecoCompleto,
  } : null);

  const varianteUrgencia =
    lead.urgencia === 'alta'  ? 'urgencia-alta'  :
    lead.urgencia === 'media' ? 'urgencia-media' : 'urgencia-baixa';

  const labelUrgencia =
    lead.urgencia === 'alta'  ? 'Urgência alta'   :
    lead.urgencia === 'media' ? 'Urgência média'  : 'Urgência baixa';

  const desbloqueioFormatado = unlockData?.unlockedAt
    ? formatarData(unlockData.unlockedAt)
    : null;

  const expiracaoFormatada = unlockData?.expiresAt
    ? formatarData(unlockData.expiresAt)
    : null;

  // ── Renderização principal ──────────────────────────────────────────────────

  return (
    <>
      {/* ─── Card ─────────────────────────────────────────────────────────── */}
      <article
        aria-label={`Lead ${lead.nomeAnonimizado}`}
        className="
          bg-white dark:bg-slate-900
          border border-slate-200 dark:border-slate-800
          rounded-xl p-5 shadow-sm hover:shadow-md
          transition-shadow duration-200
          flex flex-col gap-4
        "
      >
        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate leading-tight">
              {estadoCard !== LEAD_STATUS.BASICO && contatos?.nomeCompleto
                ? contatos.nomeCompleto
                : lead.nomeAnonimizado}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Faixa etária: {lead.faixaIdade} anos
            </p>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Categorias do lead">
            {lead.tags?.map((tag) => (
              <div key={tag} role="listitem">
                <Tag label={tag} />
              </div>
            ))}
            <div role="listitem">
              <Tag label={labelUrgencia} variant={varianteUrgencia} />
            </div>
          </div>
        </header>

        {/* ── BODY — dados INSS ──────────────────────────────────────────── */}
        <section aria-label="Dados previdenciários">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Espécie do benefício</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{lead.especieBeneficio}</dd>
            </div>

            <div>
              <dt className="text-xs text-slate-500 dark:text-slate-400">Data de indeferimento</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                {formatarData(lead.dataIndeferimento)}
              </dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500 dark:text-slate-400">Motivo do indeferimento</dt>
              <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{lead.motivoIndeferimento}</dd>
            </div>

            <div className="sm:col-span-2">
              <dt className="text-xs text-slate-500 dark:text-slate-400 mb-1">Tese jurídica (IA)</dt>
              <dd className="text-xs italic text-slate-600 dark:text-slate-400 leading-relaxed border-l-2 border-slate-200 dark:border-slate-700 pl-2">
                {lead.teseJuridica}
              </dd>
            </div>
          </dl>

          {/* Score */}
          <div className="mt-3">
            <ScoreBar valor={lead.scoreQualificacao} />
          </div>
        </section>

        {/* ── BODY — contatos (ESTADO 2 e 3) ─────────────────────────────── */}
        {estadoCard !== LEAD_STATUS.BASICO && contatos && (
          <section
            aria-label="Dados de contato desbloqueados"
            className="
              rounded-lg bg-slate-50 dark:bg-slate-800/50
              border border-slate-200 dark:border-slate-700
              p-3 space-y-2
            "
          >
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {contatos.telefones?.length > 0 && (
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Telefone(s)</dt>
                  {contatos.telefones.map((tel, i) => (
                    <dd key={i} className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{tel}</dd>
                  ))}
                </div>
              )}

              {contatos.emails?.length > 0 && (
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">E-mail(s)</dt>
                  {contatos.emails.map((email, i) => (
                    <dd key={i} className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 break-all">{email}</dd>
                  ))}
                </div>
              )}

              {contatos.enderecoCompleto && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Endereço</dt>
                  <dd className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">{contatos.enderecoCompleto}</dd>
                </div>
              )}
            </dl>

            {/* Status PJe */}
            {contatos.statusPJe && (
              <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                <StatusPJe status={contatos.statusPJe} />
              </div>
            )}

            {/* Info de desbloqueio */}
            {desbloqueioFormatado && (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Desbloqueado em {desbloqueioFormatado}
                {expiracaoFormatada && ` · Válido até ${expiracaoFormatada}`}
              </p>
            )}
          </section>
        )}

        {/* ── BODY — petição (ESTADO 3) ───────────────────────────────────── */}
        {estadoCard === LEAD_STATUS.PETICAO && (
          <section aria-label="Informações da petição gerada" className="space-y-2">
            {/* Countdown */}
            {peticaoUrl && peticaoExpiraEm && (
              <div className="flex items-center gap-2">
                <CountdownLink expiraEm={peticaoExpiraEm} onExpirado={handleLinkExpirado} />
              </div>
            )}

            {/* Histórico colapsável */}
            {historicoPeticoes.length > 0 && (
              <div>
                <button
                  type="button"
                  aria-expanded={mostrarHistorico}
                  aria-controls="historico-peticoes"
                  onClick={() => setMostrarHistorico((v) => !v)}
                  className="
                    text-xs text-slate-500 dark:text-slate-400
                    hover:text-slate-700 dark:hover:text-slate-200
                    underline underline-offset-2
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 rounded
                  "
                >
                  {historicoPeticoes.length} {historicoPeticoes.length === 1 ? 'petição gerada' : 'petições geradas'} · {mostrarHistorico ? 'ocultar histórico' : 'ver histórico'}
                </button>

                {mostrarHistorico && (
                  <ol
                    id="historico-peticoes"
                    className="mt-2 space-y-1"
                    aria-label="Histórico de petições"
                  >
                    {historicoPeticoes.map((p, i) => (
                      <li key={i} className="text-xs text-slate-500 dark:text-slate-400">
                        #{i + 1} — {formatarData(p.geradaEm)}{' '}
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-slate-700 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 rounded"
                        >
                          baixar
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── FOOTER — botões ─────────────────────────────────────────────── */}
        <footer className="flex flex-col sm:flex-row gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          {/* Botão [Abrir Contatos] / [Contatos liberados] */}
          {estadoCard === LEAD_STATUS.BASICO ? (
            <button
              type="button"
              disabled={loadingContatos}
              onClick={handleAbrirContatosClick}
              aria-label={`Abrir contatos do lead ${lead.nomeAnonimizado} — custo: ${CUSTO_CONTATOS} créditos`}
              className="
                flex-1 inline-flex items-center justify-center gap-2
                px-4 py-2.5 rounded-xl
                text-sm font-semibold
                text-white
                bg-slate-800 dark:bg-slate-200 dark:text-slate-900
                hover:bg-slate-700 dark:hover:bg-white
                border border-transparent
                transition-colors duration-150
                disabled:opacity-60 disabled:cursor-not-allowed
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
              "
            >
              {loadingContatos
                ? <TextoRotativo textos={TEXTOS_LOADING_CONTATOS} ativo={loadingContatos} />
                : (
                  <>
                    Abrir Contatos
                    <CreditoBadge valor={CUSTO_CONTATOS} />
                  </>
                )}
            </button>
          ) : (
            <button
              type="button"
              disabled
              aria-label="Contatos já liberados"
              className="
                flex-1 inline-flex items-center justify-center gap-2
                px-4 py-2.5 rounded-xl
                text-sm font-semibold
                text-emerald-700 dark:text-emerald-400
                bg-emerald-50 dark:bg-emerald-950/30
                border border-emerald-200 dark:border-emerald-800
                cursor-default opacity-100
              "
            >
              ✅ Contatos liberados
            </button>
          )}

          {/* Botão [Gerar Petição] / [Baixar Petição] / [Nova versão] */}
          {estadoCard === LEAD_STATUS.BASICO && (
            <div className="relative group flex-1">
              <button
                type="button"
                disabled
                aria-label="Gerar petição — abra os contatos primeiro"
                aria-describedby={`tooltip-peticao-${lead.id}`}
                className="
                  w-full inline-flex items-center justify-center gap-2
                  px-4 py-2.5 rounded-xl
                  text-sm font-medium
                  text-slate-400 dark:text-slate-600
                  bg-slate-50 dark:bg-slate-800/50
                  border border-slate-200 dark:border-slate-700
                  cursor-not-allowed
                "
              >
                Gerar Petição
                <CreditoBadge valor={CUSTO_PETICAO} />
              </button>
              <div
                id={`tooltip-peticao-${lead.id}`}
                role="tooltip"
                className="
                  absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                  px-3 py-1.5 rounded-lg
                  text-xs text-white bg-slate-800 dark:bg-slate-700
                  whitespace-nowrap shadow-lg
                  opacity-0 group-hover:opacity-100 pointer-events-none
                  transition-opacity duration-150
                  z-10
                "
              >
                Abra os contatos primeiro
                <div
                  aria-hidden="true"
                  className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800 dark:border-t-slate-700"
                />
              </div>
            </div>
          )}

          {estadoCard === LEAD_STATUS.CONTATOS && (
            <button
              type="button"
              disabled={loadingPeticao}
              onClick={handleGerarPeticaoClick}
              aria-label={`Gerar petição para o lead ${lead.nomeAnonimizado} — custo: ${CUSTO_PETICAO} créditos`}
              className="
                flex-1 inline-flex items-center justify-center gap-2
                px-4 py-2.5 rounded-xl
                text-sm font-medium
                text-slate-700 dark:text-slate-300
                bg-white dark:bg-slate-800
                hover:bg-slate-50 dark:hover:bg-slate-700
                border border-slate-200 dark:border-slate-700
                transition-colors duration-150
                disabled:opacity-60 disabled:cursor-not-allowed
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
              "
            >
              {loadingPeticao
                ? <TextoRotativo textos={TEXTOS_LOADING_PETICAO} ativo={loadingPeticao} />
                : (
                  <>
                    Gerar Petição
                    <CreditoBadge valor={CUSTO_PETICAO} />
                  </>
                )}
            </button>
          )}

          {estadoCard === LEAD_STATUS.PETICAO && (
            <div className="flex flex-1 gap-2">
              {/* Botão principal: Baixar ou Gerar Nova */}
              <button
                type="button"
                onClick={peticaoUrl ? handleBaixarPeticao : handleGerarPeticaoClick}
                disabled={loadingPeticao}
                aria-label={peticaoUrl ? 'Baixar petição gerada' : 'Gerar nova versão da petição'}
                className={`
                  flex-1 inline-flex items-center justify-center gap-2
                  px-4 py-2.5 rounded-xl
                  text-sm font-semibold
                  transition-colors duration-150
                  disabled:opacity-60 disabled:cursor-not-allowed
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
                  ${peticaoUrl
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/50'
                    : 'text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }
                `}
              >
                {loadingPeticao
                  ? <TextoRotativo textos={TEXTOS_LOADING_PETICAO} ativo={loadingPeticao} />
                  : peticaoUrl
                    ? <>📄 Baixar Petição</>
                    : <>Gerar Nova Versão <CreditoBadge valor={CUSTO_PETICAO} /></>
                }
              </button>

              {/* Botão discreto de regeneração (quando já existe URL válida) */}
              {peticaoUrl && (
                <button
                  type="button"
                  disabled={loadingPeticao}
                  onClick={handleGerarPeticaoClick}
                  aria-label={`Gerar nova versão da petição — custo: ${CUSTO_PETICAO} créditos`}
                  title="Gerar nova versão"
                  className="
                    p-2.5 rounded-xl
                    text-slate-400 dark:text-slate-500
                    hover:text-slate-600 dark:hover:text-slate-300
                    hover:bg-slate-100 dark:hover:bg-slate-800
                    border border-slate-200 dark:border-slate-700
                    transition-colors duration-150
                    disabled:opacity-40 disabled:cursor-not-allowed
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400
                  "
                >
                  <svg
                    aria-hidden="true"
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                </button>
              )}
            </div>
          )}
        </footer>
      </article>

      {/* ─── Modais ─────────────────────────────────────────────────────────── */}
      <ConfirmContactUnlockModal
        isOpen={modalContatosOpen}
        onClose={() => setModalContatosOpen(false)}
        onConfirm={handleConfirmarContatos}
        nomeAnonimizado={lead.nomeAnonimizado}
        custoCreditos={CUSTO_CONTATOS}
        saldoAtual={saldo ?? 0}
        isLoading={loadingContatos}
      />

      <GeneratePetitionModal
        isOpen={modalPeticaoOpen}
        onClose={() => setModalPeticaoOpen(false)}
        onConfirm={handleConfirmarPeticao}
        nomeAnonimizado={lead.nomeAnonimizado}
        custoCreditos={CUSTO_PETICAO}
        saldoAtual={saldo ?? 0}
        advogado={advogado}
        isLoading={loadingPeticao}
      />

      <InsufficientCreditsModal
        isOpen={modalCreditosOpen}
        onClose={() => setModalCreditosOpen(false)}
        onComprar={() => {
          setModalCreditosOpen(false);
          onComprarCreditos?.();
        }}
        saldoAtual={saldo ?? 0}
        custoAcao={creditosModalCusto}
      />
    </>
  );
}

export default LeadCardPro;
