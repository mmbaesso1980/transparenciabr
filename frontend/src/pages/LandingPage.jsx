import { FileSearch, Lock, Shield } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";

/**
 * Vitrine pública (raiz /) — Padrão Ouro: fundo operacional, tipografia executiva.
 */
export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#080b14] text-[#F0F4FC]">
      <Helmet>
        <title>Motor Forense TransparênciaBR — Fiscalização com IA e OSINT</title>
        <meta
          name="description"
          content="Inteligência Artificial e OSINT na fiscalização pública. Dossiês, CEAP e transparência com rigor forense."
        />
        <meta property="og:title" content="Motor Forense TransparênciaBR" />
        <meta
          property="og:description"
          content="Inteligência Artificial e OSINT na fiscalização pública."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-[0.07]"
      >
        <div className="absolute -left-[20%] top-[10%] h-[32rem] w-[32rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(110,168,255,0.5)_0%,transparent_65%)] blur-3xl" />
        <div className="absolute -right-[15%] bottom-[5%] h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(253,224,71,0.35)_0%,transparent_68%)] blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-[#30363D]/80 bg-[#0d1117]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-5">
          <BrandLogo to="/" />
          <span className="hidden items-center gap-2 rounded-full border border-[#30363D] bg-[#161B22]/90 px-3 py-1.5 font-data text-[10px] uppercase tracking-[0.2em] text-[#8B949E] sm:inline-flex">
            <Shield className="size-3.5 text-[#58A6FF]" strokeWidth={1.75} aria-hidden />
            Canal público
          </span>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-3xl px-6 pb-20 pt-16 sm:pt-24">
        <p className="font-data text-[11px] uppercase tracking-[0.35em] text-[#58A6FF]">
          Protocolo operacional
        </p>
        <h1 className="mt-4 text-4xl font-bold leading-[1.15] tracking-tight text-[#F0F4FC] sm:text-5xl md:text-[3.25rem]">
          Motor Forense TransparênciaBR
        </h1>
        <p className="mt-6 text-xl leading-relaxed text-[#C9D1D9] sm:text-2xl">
          Inteligência Artificial e OSINT na fiscalização pública
        </p>
        <p className="mt-8 text-lg leading-relaxed text-[#8B949E]">
          Painel unificado para leitura de dossiês, despesas CEAP e alertas — com disciplina de dados,
          rastreabilidade e linguagem compatível com auditoria social.
        </p>

        <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
          <Link
            to="/universo"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#58A6FF]/45 bg-[#58A6FF]/12 px-8 py-4 text-base font-semibold text-[#F0F4FC] transition hover:bg-[#58A6FF]/20"
          >
            <FileSearch className="size-5 shrink-0 text-[#58A6FF]" strokeWidth={1.75} aria-hidden />
            Acessar Dossiê Público
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#FDE047]/40 bg-[#FDE047]/8 px-8 py-4 text-base font-semibold text-[#FDE047] transition hover:bg-[#FDE047]/15"
          >
            <Lock className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
            Login Restrito (Modo GOD)
          </Link>
        </div>

        <p className="mt-14 border-t border-[#21262D] pt-8 text-center text-sm leading-relaxed text-[#484F58]">
          Acesso anónimo à vitrine não substitui verificação jurídica. Dados provenientes de fontes
          públicas e snapshots Firestore.
        </p>
      </main>
    </div>
  );
}
