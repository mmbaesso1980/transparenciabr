import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Construction,
  Globe,
  LayoutDashboard,
  Sparkles,
} from "lucide-react";

/**
 * PainelPage — Stub provisório (07/05/2026)
 *
 * O Painel v2 está sendo construído pelo Cursor neste momento.
 * Esta página é um placeholder para que /painel não redirecione mais para /universo.
 *
 * Quando o Painel v2 for pushado, este arquivo será SUBSTITUÍDO integralmente.
 */
export default function PainelPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#080B14] text-[#F0F4FC]">
      <Helmet>
        <title>Painel · em construção | Transparência BR</title>
        <meta name="description" content="Painel investigativo TransparênciaBR — em construção." />
      </Helmet>

      {/* Glow ambiental */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(34,211,238,0.08), transparent), radial-gradient(ellipse 50% 30% at 70% 70%, rgba(167,139,250,0.06), transparent)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 py-16">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-cyan-300">
            <Construction className="size-3.5" aria-hidden />
            Em construção
          </span>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#F0F4FC] sm:text-5xl">
            Painel investigativo
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-[#8B949E]">
            Estamos finalizando o painel com 17 bentos de inteligência política, rankings em tempo
            real e portais para os parlamentares mais relevantes. Disponível em breve.
          </p>

          {/* 3 bentos placeholder pra dar uma ideia */}
          <div className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-3">
            {[
              { icon: Activity, label: "Rankings ao vivo", color: "#22d3ee" },
              { icon: LayoutDashboard, label: "17 bentos", color: "#a78bfa" },
              { icon: Globe, label: "Portais → Universo", color: "#fbbf24" },
            ].map((b, i) => {
              const Icon = b.icon;
              return (
                <motion.div
                  key={b.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + i * 0.08 }}
                  className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-4 backdrop-blur-md"
                >
                  <div
                    className="mx-auto flex size-9 items-center justify-center rounded-xl border border-white/5"
                    style={{
                      background: `linear-gradient(135deg, ${b.color}22, ${b.color}08)`,
                      color: b.color,
                    }}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                  </div>
                  <p className="mt-3 text-xs font-medium text-[#cbd5e1]">{b.label}</p>
                </motion.div>
              );
            })}
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/universo"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-5 py-2.5 text-sm font-semibold text-[#02040a] shadow-[0_0_24px_-6px_rgba(34,211,238,0.55)] transition hover:brightness-110"
            >
              <Sparkles className="size-4" strokeWidth={2} />
              Explorar o Universo
              <ArrowRight className="size-4" strokeWidth={2} />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-[#F0F4FC] transition hover:border-cyan-400/30 hover:bg-cyan-400/5"
            >
              Voltar ao início
            </Link>
          </div>

          <p className="mt-12 text-xs text-[#5c6784]">
            🚧 Esta página será substituída automaticamente pela versão v2 ao ser publicada.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
