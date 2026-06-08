import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Share2,
  Download,
  Bookmark,
  BookmarkCheck,
  TrendingUp,
  AlertTriangle,
  Leaf,
  Activity,
} from "lucide-react";
import { fmtBRL, fmtBRLcompact } from "../../utils/formatBRL.js";

/**
 * HotpagePoliticoHero — Hero premium pra colar no TOPO da DossiePage existente.
 * NÃO substitui nada da DossiePage — é uma camada de valor visual em cima.
 *
 * Props:
 *  - politico: { id, nome, partido, uf, cargo, fotoUrl, score, cota, sinalizacoes,
 *                frugalidade, atividade, serie30dGastos }
 *  - onDownloadPDF: () => void  (delegado pro DossiePage que já tem html2pdf)
 *  - inWatchlist: boolean
 *  - onToggleWatchlist: () => void
 */

const partyColorMap = {
  PT: "#dc2626", PL: "#16a34a", MDB: "#1e40af", PSD: "#0ea5e9",
  UNIAO: "#1e3a8a", PP: "#1e40af", REPUBLICANOS: "#1e40af",
  PSDB: "#0ea5e9", PDT: "#dc2626", NOVO: "#f97316", PSB: "#facc15",
  PCdoB: "#dc2626", SOLIDARIEDADE: "#f97316", PODE: "#f97316", CIDADANIA: "#dc2626",
};

function ScoreGauge({ score = 0 }) {
  const angle = (score / 100) * 180;
  const dash = (angle / 180) * 141.37;
  return (
    <div className="relative w-40 h-24">
      <svg viewBox="0 0 100 50" className="w-full h-full">
        <path d="M 5 50 A 45 45 0 0 1 95 50" stroke="#1f2937" strokeWidth="6" fill="none" strokeLinecap="round" />
        <path
          d="M 5 50 A 45 45 0 0 1 95 50"
          stroke="url(#heroScoreGrad)"
          strokeWidth="6"
          fill="none"
          strokeDasharray={`${dash} 141.37`}
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="heroScoreGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#a78bfa" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <span className="text-3xl font-semibold text-white tabular-nums leading-none">{score}</span>
        <span className="text-[10px] text-white/40 uppercase tracking-wider mt-0.5">Pontuação Aurora</span>
      </div>
    </div>
  );
}

function Sparkline({ data = [] }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / range) * 100}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline points={`0,30 ${pts} 100,30`} fill="url(#sparkFill)" />
      <polyline points={pts} fill="none" stroke="#22d3ee" strokeWidth="1.2" />
    </svg>
  );
}

function KPIPill({ icon: Icon, label, value, accent = "cyan" }) {
  const accentMap = {
    cyan: "border-cyan-400/20 bg-cyan-500/5 text-cyan-300",
    violet: "border-violet-400/20 bg-violet-500/5 text-violet-300",
    red: "border-red-400/20 bg-red-500/5 text-red-300",
    green: "border-emerald-400/20 bg-emerald-500/5 text-emerald-300",
    amber: "border-amber-400/20 bg-amber-500/5 text-amber-300",
  };
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${accentMap[accent]}`}
    >
      <Icon size={18} strokeWidth={1.6} className="opacity-80 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider opacity-70 leading-none">{label}</p>
        <p className="text-base font-semibold tabular-nums leading-tight mt-0.5 text-white">{value}</p>
      </div>
    </motion.div>
  );
}

export default function HotpagePoliticoHero({
  politico = {},
  onDownloadPDF = () => {},
  inWatchlist = false,
  onToggleWatchlist = () => {},
}) {
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(inWatchlist);

  const partyColor = partyColorMap[politico.partido] || "#22d3ee";
  const initial = (politico.nome || "?").trim()[0]?.toUpperCase() || "?";

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const handleBookmark = () => {
    setBookmarked((b) => !b);
    onToggleWatchlist();
  };

  const sparkData = useMemo(
    () => politico.serie30dGastos || Array.from({ length: 30 }, (_, i) => 50 + Math.sin(i / 3) * 20 + i * 0.8),
    [politico.serie30dGastos]
  );

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[#30363D] bg-[#0D1117]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 0%, rgba(34,211,238,0.08), transparent 50%)," +
          "radial-gradient(circle at 80% 100%, rgba(167,139,250,0.06), transparent 50%)",
      }}
    >
      {/* Banda de cor do partido */}
      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: partyColor }} />

      <div className="relative px-6 md:px-10 py-8 md:py-10">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
          className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-6 md:gap-8 items-start"
        >
          {/* Avatar */}
          <motion.div
            variants={{ hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1 } }}
            className="relative flex-shrink-0"
          >
            <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-3xl overflow-hidden ring-2 ring-white/10 shadow-2xl">
              {politico.fotoUrl ? (
                <img src={politico.fotoUrl} alt={politico.nome} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-5xl font-semibold text-white"
                  style={{ background: `linear-gradient(135deg, ${partyColor}, #1f2937)` }}
                >
                  {initial}
                </div>
              )}
            </div>
            <div
              className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-[#0D1117] border-2 border-[#30363D] flex items-center justify-center text-[10px] font-bold text-white"
              style={{ background: partyColor }}
              title={politico.partido}
            >
              {politico.partido || "—"}
            </div>
          </motion.div>

          {/* Identidade + sparkline */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
            className="min-w-0"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
              {politico.cargo || "Parlamentar"}
            </p>
            <h1 className="mt-2 text-3xl md:text-4xl font-bold tracking-tight text-[#F0F4FC]">
              {politico.nome || "Parlamentar"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span
                className="px-2.5 py-1 rounded-md font-semibold border"
                style={{ background: `${partyColor}20`, borderColor: `${partyColor}50`, color: partyColor }}
              >
                {politico.partido || "—"}
              </span>
              <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[#F0F4FC]/80">
                {politico.uf || "BR"}
              </span>
              {politico.legislatura && (
                <span className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-[#8B949E]">
                  {politico.legislatura}
                </span>
              )}
            </div>

            <div className="mt-5">
              <p className="text-[10px] uppercase tracking-wider text-[#8B949E] mb-1">
                Gastos CEAP · últimos 30 dias
              </p>
              <Sparkline data={sparkData} />
            </div>
          </motion.div>

          {/* Score gauge */}
          <motion.div
            variants={{ hidden: { opacity: 0, scale: 0.92 }, show: { opacity: 1, scale: 1 } }}
            className="flex flex-col items-center"
          >
            <ScoreGauge score={politico.score ?? 0} />
            <p className="text-[10px] text-[#8B949E] mt-2 max-w-[180px] text-center leading-tight">
              Indicador computacional. Não é decisão judicial.
            </p>
          </motion.div>
        </motion.div>

        {/* KPIs */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.2 } } }}
          className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
            <KPIPill icon={TrendingUp} label="Cota total" value={fmtBRLcompact(politico.cota)} accent="violet" />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
            <KPIPill
              icon={AlertTriangle}
              label="Sinalizações"
              value={politico.sinalizacoes ?? 0}
              accent={(politico.sinalizacoes || 0) > 5 ? "red" : "amber"}
            />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
            <KPIPill icon={Leaf} label="Frugalidade" value={`${politico.frugalidade ?? 0}%`} accent="green" />
          </motion.div>
          <motion.div variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}>
            <KPIPill icon={Activity} label="Atividade" value={`${politico.atividade ?? 0}%`} accent="cyan" />
          </motion.div>
        </motion.div>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-8 flex flex-wrap gap-2"
        >
          <button
            onClick={handleShare}
            className="inline-flex items-center gap-2 rounded-xl border border-[#30363D] bg-white/[0.03] px-4 py-2.5 text-sm text-[#F0F4FC] hover:border-cyan-400/40 hover:bg-cyan-500/[0.08] transition-all"
          >
            <Share2 size={16} strokeWidth={1.6} />
            {copied ? "Link copiado" : "Compartilhar"}
          </button>
          <button
            onClick={onDownloadPDF}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/15 border border-cyan-400/40 px-4 py-2.5 text-sm font-medium text-cyan-200 hover:bg-cyan-500/25 transition-all shadow-[0_0_20px_-8px_rgba(34,211,238,0.5)]"
          >
            <Download size={16} strokeWidth={1.8} />
            Baixar dossiê (PDF)
          </button>
          <button
            onClick={handleBookmark}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm transition-all ${
              bookmarked
                ? "bg-violet-500/15 border-violet-400/40 text-violet-200"
                : "border-[#30363D] bg-white/[0.03] text-[#F0F4FC] hover:border-violet-400/40"
            }`}
          >
            {bookmarked ? <BookmarkCheck size={16} strokeWidth={1.8} /> : <Bookmark size={16} strokeWidth={1.6} />}
            {bookmarked ? "No Universo" : "Salvar no Universo"}
          </button>
        </motion.div>
      </div>
    </section>
  );
}
