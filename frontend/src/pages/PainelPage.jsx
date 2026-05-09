import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import BentoCard from '../components/painel/BentoCard';
import BentoModal from '../components/painel/BentoModal';
import { usePainelData } from '../hooks/usePainelData';
import {
  PontuacaoBrasil,
  MaioresCotas,
  SinalizacoesSOC,
  MapaUFBrasil,
  PulsoCEAP,
  MataUFBrasil,
  EmendasCriticas,
  ContratosPNCP,
  RadarJuridico,
  MeuUniverso,
  MaisFrugais,
  InfluenciaSetorial,
  AtividadeLegislativa,
  PromessaEntrega,
  PulsoFederal,
  RedeEmpresarial,
  AberturaOrgao,
} from '../components/painel/bentos';

const TRANSPARENCIA_LOGO = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
    <path
      d="M12 2 L20 6 L20 14 Q20 19 12 22 Q4 19 4 14 L4 6 Z"
      stroke="#22d3ee"
      strokeWidth="1.5"
      fill="rgba(34, 211, 238, 0.08)"
    />
    <circle cx="12" cy="12" r="3" fill="#22d3ee" opacity="0.7" />
  </svg>
);

export default function PainelPage() {
  const data = usePainelData();
  const [modalConfig, setModalConfig] = useState(null);

  const openModal = (cfg) => setModalConfig(cfg);
  const closeModal = () => setModalConfig(null);

  // Configurações de modal por bento (qual sortKey/valueLabel usar no ranking)
  const M = {
    cotas: {
      title: 'Maiores Cotas — ranking 513',
      sortKey: 'cota',
      valueLabel: 'Cota R$',
      defaultSortOrder: 'desc',
    },
    frugais: {
      title: 'Mais Frugais — % de aproveitamento da cota',
      sortKey: 'pct',
      valueLabel: 'Cota R$',
      defaultSortOrder: 'asc',
    },
    score: {
      title: 'Pontuação Aurora — ranking 513',
      sortKey: 'score',
      valueLabel: 'Score',
      defaultSortOrder: 'desc',
    },
    sinaliz: {
      title: 'Em Observação — ranking 513',
      sortKey: 'sinalizacoes',
      valueLabel: 'Sinalizações',
      defaultSortOrder: 'desc',
    },
    presenca: {
      title: 'Atividade Legislativa — ranking 513',
      sortKey: 'presenca',
      valueLabel: 'Presença %',
      defaultSortOrder: 'desc',
    },
  };

  return (
    <div className="min-h-screen bg-[#05060d] text-white">
      {/* fundo estrelado / espacial */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,0.4), transparent 50%),' +
              'radial-gradient(1.5px 1.5px at 70% 70%, rgba(255,255,255,0.3), transparent 50%),' +
              'radial-gradient(1px 1px at 40% 80%, rgba(255,255,255,0.5), transparent 50%),' +
              'radial-gradient(1.5px 1.5px at 85% 25%, rgba(34,211,238,0.4), transparent 50%),' +
              'radial-gradient(1px 1px at 10% 60%, rgba(167,139,250,0.4), transparent 50%)',
            backgroundSize: '600px 600px, 800px 800px, 400px 400px, 700px 700px, 500px 500px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#05060d]/40 to-[#05060d]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-[#05060d]/80 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            {TRANSPARENCIA_LOGO}
            <span className="text-[15px] font-semibold tracking-tight">
              Transparência<span className="text-cyan-400">BR</span>{' '}
              <span className="text-white/40 font-normal">/ Aurora</span>
            </span>
          </div>

          <div className="flex-1 max-w-xl">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
              <input
                type="text"
                placeholder="O que você quer auditar hoje?"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm placeholder-white/40 focus:outline-none focus:border-cyan-400/40 transition-colors"
              />
            </div>
          </div>

          <Link
            to="/universo"
            className="hidden md:inline-flex items-center gap-2 bg-violet-500/15 border border-violet-400/30 rounded-xl px-4 py-2 text-violet-200 hover:bg-violet-500/25 transition-colors text-sm font-medium"
          >
            UNIVERSO <span className="text-violet-300">→</span>
          </Link>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-violet-400 ring-2 ring-white/10" />
            <span className="hidden md:inline text-xs text-white/60 tabular-nums">
              {data.headerInfo?.creditos != null ? `${data.headerInfo.creditos} créditos` : 'visitante'}
            </span>
          </div>
        </div>
      </header>

      {/* Grid principal */}
      <main className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04 } },
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 auto-rows-[140px] gap-3 md:gap-4"
        >
          {[
            // ─── Linha 1 ───
            { key: 'b01', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🏆', title: 'Pontuação Brasil',
              child: <PontuacaoBrasil data={data.pontuacaoBrasil} />, modal: M.score },
            { key: 'b02', span: 'lg:col-span-1 lg:row-span-1', accent: 'violet', icon: '⚠️', title: 'Maiores Cotas',
              child: <MaioresCotas data={data.maioresCotas} />, modal: M.cotas },
            { key: 'b03', span: 'lg:col-span-1 lg:row-span-1', accent: 'red',    icon: '⚡', title: 'Sinalizações SOC',
              child: <SinalizacoesSOC data={data.sinalizacoesSOC} />, modal: M.sinaliz },
            { key: 'b04', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🇧🇷', title: 'Mapa UF Brasil',
              child: <MapaUFBrasil data={data.mapaUF} />, modal: M.cotas },
            { key: 'b05', span: 'lg:col-span-1 lg:row-span-1', accent: 'amber',  icon: '📈', title: 'Pulso CEAP',
              child: <PulsoCEAP data={data.pulsoCEAP} />, modal: M.cotas },

            // ─── Linha 2 ───
            { key: 'b06', span: 'lg:col-span-1 lg:row-span-1', accent: 'red',    icon: '🌑', title: 'Mata UF Brasil',
              child: <MataUFBrasil data={data.mataUF} />, modal: M.sinaliz },
            { key: 'b07', span: 'lg:col-span-1 lg:row-span-1', accent: 'amber',  icon: '⚠️', title: 'Emendas Críticas',
              child: <EmendasCriticas data={data.emendasCriticas} />, modal: M.cotas },
            { key: 'b08', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '📊', title: 'Contratos PNCP',
              child: <ContratosPNCP data={data.contratosPNCP} />, modal: M.cotas },
            { key: 'b09', span: 'lg:col-span-1 lg:row-span-1', accent: 'green',  icon: '⚖️', title: 'Radar Jurídico',
              child: <RadarJuridico data={data.radarJuridico} />, modal: M.sinaliz },
            { key: 'b10', span: 'lg:col-span-1 lg:row-span-2', accent: 'violet', icon: '🪐', title: 'Meu Universo',
              child: <MeuUniverso data={data.meuUniverso} />, modal: null },

            // ─── Linha 3 ───
            { key: 'b11', span: 'lg:col-span-1 lg:row-span-1', accent: 'green',  icon: '🌱', title: 'Mais Frugais',
              child: <MaisFrugais data={data.maisFrugais} />, modal: M.frugais },
            { key: 'b12', span: 'lg:col-span-2 lg:row-span-1', accent: 'cyan',   icon: '🔀', title: 'Influência Setorial',
              child: <InfluenciaSetorial data={data.influenciaSetorial} />, modal: M.score },
            { key: 'b13', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '📋', title: 'Atividade Legislativa',
              child: <AtividadeLegislativa data={data.atividadeLegislativa} />, modal: M.presenca },

            // ─── Linha 4 ───
            { key: 'b14', span: 'lg:col-span-1 lg:row-span-1', accent: 'amber',  icon: '🎯', title: 'Promessa × Entrega',
              child: <PromessaEntrega data={data.promessaEntrega} />, modal: M.score },
            { key: 'b15', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🌡️', title: 'Pulso Federal',
              child: <PulsoFederal data={data.pulsoFederal} />, modal: M.cotas },
            { key: 'b16', span: 'lg:col-span-1 lg:row-span-1', accent: 'violet', icon: '🕸️', title: 'Rede Empresarial',
              child: <RedeEmpresarial data={data.redeEmpresarial} />, modal: M.cotas },
            { key: 'b17', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🔓', title: 'Abertura por Órgão',
              child: <AberturaOrgao data={data.aberturaOrgao} />, modal: M.score },
          ].map((b) => (
            <motion.div
              key={b.key}
              variants={{
                hidden: { opacity: 0, y: 16 },
                show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
              }}
              className={b.span}
            >
              <BentoCard
                title={b.title}
                icon={b.icon}
                accent={b.accent}
                onClick={() => b.modal && openModal(b.modal)}
              >
                {b.child}
              </BentoCard>
            </motion.div>
          ))}
        </motion.div>

        <p className="text-center text-[11px] text-white/30 mt-8">
          Aurora · TransparênciaBR · dados reais quando disponíveis · “em breve” quando ainda em coleta
        </p>
      </main>

      <BentoModal
        open={!!modalConfig}
        onClose={closeModal}
        title={modalConfig?.title}
        subtitle={data.rankingGastadores?.length
          ? `Toda nota é suspeita até prova contrária · ${data.rankingGastadores.length} parlamentares com gasto registrado`
          : 'Toda nota é suspeita até prova contrária · 594 parlamentares'}
        data={data.rankingParaModal || data.parlamentares}
        sortKey={modalConfig?.sortKey || 'cota'}
        defaultSortOrder={modalConfig?.defaultSortOrder || 'desc'}
        valueLabel={modalConfig?.valueLabel || 'Valor'}
      />
    </div>
  );
}
