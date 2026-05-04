import { Building2, Scale, Users } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";

import BrandLogo from "../components/BrandLogo.jsx";

/**
 * Hotpage institucional de partidos — substitui o stub comercial.
 * Conteúdo estático + CTAs para universo e créditos (sem backend novo).
 */
export default function PartidoPage() {
  return (
    <div className="min-h-dvh bg-[#080B14] px-4 py-10 text-[#F0F4FC] sm:px-8">
      <Helmet>
        <title>Partidos & transparência — TransparênciaBR</title>
        <meta
          name="description"
          content="Visão forense sobre bancadas, transparência de dados públicos e acesso ao motor AURORA."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl">
        <header className="mb-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <BrandLogo to="/" variant="full" size="md" />
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8B949E]">
              Institucional
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Partidos na lupa forense</h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#8B949E]">
              A TransparênciaBR agrega despesas CEAP, alertas e cruzamentos com fontes oficiais. Use o
              universo 3D para navegar por parlamentar ou adquira créditos para dossiês completos.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              to="/universo"
              className="rounded-xl bg-[#58A6FF] px-4 py-2.5 text-center text-sm font-semibold text-[#02040a] hover:brightness-110"
            >
              Explorar universo
            </Link>
            <Link
              to="/creditos"
              className="rounded-xl border border-[#30363D] px-4 py-2.5 text-center text-sm text-[#58A6FF] hover:border-[#58A6FF]/50"
            >
              Créditos & planos
            </Link>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Bancadas",
              body: "Compare volumes e padrões de despesas entre siglas com base em dados públicos classificados.",
            },
            {
              icon: Scale,
              title: "Compliance",
              body: "Scores são indicadores computacionais — não substituem decisão judicial ou administrativa.",
            },
            {
              icon: Building2,
              title: "API & dados",
              body: "O datalake alimenta KPIs públicos; integrações avançadas via Cloud Functions já deployadas.",
            },
          ].map((c) => (
            <section
              key={c.title}
              className="rounded-2xl border border-[#30363D] bg-[#0D1117]/80 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <c.icon className="size-8 text-[#58A6FF]" strokeWidth={1.5} />
              <h2 className="mt-3 text-lg font-semibold">{c.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#8B949E]">{c.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-[#484F58]">
          Dúvidas legais:{" "}
          <Link to="/metodologia" className="text-[#58A6FF] hover:underline">
            Metodologia
          </Link>{" "}
          ·{" "}
          <Link to="/termos" className="text-[#58A6FF] hover:underline">
            Termos
          </Link>
        </p>
      </div>
    </div>
  );
}
