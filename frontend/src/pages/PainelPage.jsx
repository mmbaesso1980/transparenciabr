/**
 * Painel Aurora — grelha 17 Bento cards (spec `painel_drop_07mai.zip`: Pontuação Brasil, Maiores Cotas,
 * Sinalizações SOC, Mapa UF, Pulso CEAP, etc.). O ZIP não está versionado no repo; este ficheiro é a
 * implementação canónica + `usePainelData` + `components/painel/*`.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import BentoCard from '../components/painel/BentoCard';
import GlobalSearch from '../components/GlobalSearch.jsx';
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
  CoberturaDatalake,
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
  const navigate = useNavigate();

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
            <GlobalSearch className="w-full" />
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
              {data.headerInfo?.ilimitado
                ? "∞ créditos"
                : data.headerInfo?.creditos != null
                  ? `${data.headerInfo.creditos.toLocaleString("pt-BR")} créditos`
                  : "visitante"}
            </span>
          </div>
        </div>
      </header>

      {!data.loading && (data.kpisFetchError || data.rankingFetchError) ? (
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-4">
          <div className="rounded-xl border border-amber-500/35 bg-amber-950/30 px-4 py-3 text-left text-[12px] leading-relaxed text-amber-50/95">
            <p className="font-semibold text-amber-100">Alguns dados do painel falharam ao carregar</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-white/55">
              {data.rankingFetchError ? (
                <li>
                  <span className="text-white/75">Ranking CEAP (JSON público):</span>{" "}
                  <span className="font-mono text-[11px]">{data.rankingFetchError}</span>
                  {" — "}
                  no Hosting, o CSP já deve permitir{" "}
                  <code className="text-cyan-300/90">https://storage.googleapis.com</code>; no bucket{" "}
                  <code className="text-cyan-300/90">tbr-public-dashboard</code>, aplique CORS (
                  <code className="text-cyan-300/90">scripts/gcs-cors-tbr-public-dashboard.json</code>
                  ).
                </li>
              ) : null}
              {data.kpisFetchError ? (
                <li>
                  <span className="text-white/75">KPIs datalake:</span>{" "}
                  <span className="font-mono text-[11px]">{data.kpisFetchError}</span>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

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
          {/* Rotas táticas consolidadas: /ranking, /emendas, /anomalias, /status, /gabinete, /universo, /partido, /risco */}
          {[
            // ─── Linha 1 ───
            { key: 'b01', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🏆', title: 'Pontuação Brasil',
              child: <PontuacaoBrasil data={data.pontuacaoBrasil} />, href: '/risco' },
            { key: 'b02', span: 'lg:col-span-1 lg:row-span-1', accent: 'violet', icon: '⚠️', title: 'Maiores Cotas',
              child: <MaioresCotas data={data.maioresCotas} />, href: '/ranking' },
            { key: 'b03', span: 'lg:col-span-1 lg:row-span-1', accent: 'red',    icon: '⚡', title: 'Sinalizações SOC',
              child: <SinalizacoesSOC data={data.sinalizacoesSOC} />, href: '/anomalias' },
            { key: 'b04', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🇧🇷', title: 'Mapa UF Brasil',
              child: <MapaUFBrasil data={data.mapaUF} />, href: '/universo' },
            { key: 'b05', span: 'lg:col-span-1 lg:row-span-1', accent: 'amber',  icon: '📈', title: 'Pulso CEAP',
              child: <PulsoCEAP data={data.pulsoCEAP} />, href: '/ranking' },

            // ─── Linha 2 ───
            { key: 'b06', span: 'lg:col-span-1 lg:row-span-1', accent: 'red',    icon: '🌑', title: 'Mata UF Brasil',
              child: <MataUFBrasil data={data.mataUF} />, href: '/risco' },
            { key: 'b07', span: 'lg:col-span-1 lg:row-span-1', accent: 'amber',  icon: '⚠️', title: 'Emendas Críticas',
              child: <EmendasCriticas data={data.emendasCriticas} />, href: '/emendas' },
            { key: 'b08', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '📊', title: 'Contratos PNCP',
              child: <ContratosPNCP data={data.contratosPNCP} />, href: '/gabinete' },
            { key: 'b09', span: 'lg:col-span-1 lg:row-span-1', accent: 'green',  icon: '📡', title: 'Cobertura datalake',
              child: <CoberturaDatalake data={data.coberturaDatalake} />, href: '/status' },
            { key: 'b10', span: 'lg:col-span-1 lg:row-span-2', accent: 'violet', icon: '🪐', title: 'Meu Universo',
              child: <MeuUniverso data={data.meuUniverso} />, href: '/universo' },

            // ─── Linha 3 ───
            { key: 'b11', span: 'lg:col-span-1 lg:row-span-1', accent: 'green',  icon: '🌱', title: 'Mais Frugais',
              child: <MaisFrugais data={data.maisFrugais} />, href: '/ranking' },
            { key: 'b12', span: 'lg:col-span-2 lg:row-span-1', accent: 'cyan',   icon: '🔀', title: 'Influência Setorial',
              child: <InfluenciaSetorial data={data.influenciaSetorial} />, href: '/partido' },
            { key: 'b13', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '📋', title: 'Atividade Legislativa',
              child: <AtividadeLegislativa data={data.atividadeLegislativa} />, href: '/universo' },

            // ─── Linha 4 ───
            { key: 'b14', span: 'lg:col-span-1 lg:row-span-1', accent: 'amber',  icon: '🎯', title: 'Promessa × Entrega',
              child: <PromessaEntrega data={data.promessaEntrega} />, href: '/emendas' },
            { key: 'b15', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🌡️', title: 'Pulso Federal',
              child: <PulsoFederal data={data.pulsoFederal} />, href: '/status' },
            { key: 'b16', span: 'lg:col-span-1 lg:row-span-1', accent: 'violet', icon: '🕸️', title: 'Rede Empresarial',
              child: <RedeEmpresarial data={data.redeEmpresarial} />, href: '/anomalias' },
            { key: 'b17', span: 'lg:col-span-1 lg:row-span-1', accent: 'cyan',   icon: '🔓', title: 'Abertura por Órgão',
              child: <AberturaOrgao data={data.aberturaOrgao} />, href: '/gabinete' },
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
                onClick={() => navigate(b.href)}
              >
                {b.child}
              </BentoCard>
            </motion.div>
          ))}
        </motion.div>

        <p className="text-center text-[11px] text-white/30 mt-8">
          Aurora · TransparênciaBR · dados públicos (Câmara, Senado, CEAP classificado, PNCP)
        </p>
      </main>
    </div>
  );
}
