/**
 * VendasPage.jsx — Landing page de vendas com planos freemium + premium
 */

import { useState } from "react";
import { Check, Zap, Shield, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const PLANS = [
  {
    id: "free",
    name: "Gratuito",
    price: "R$ 0",
    description: "Comece a explorar",
    credits: 0,
    features: [
      "✅ Acesso ao painel público",
      "✅ Busca de parlamentares",
      "✅ Dados básicos (CEAP, emendas)",
      "✅ Relatórios públicos",
      "❌ Chat com IA",
      "❌ Dossiers forenses",
      "❌ Alertas em tempo real",
    ],
    cta: "Começar",
    highlighted: false,
  },
  {
    id: "starter",
    name: "Starter",
    price: "R$ 49",
    description: "Para jornalistas",
    credits: 500,
    features: [
      "✅ Tudo do Gratuito",
      "✅ 50 consultas Chat IA",
      "✅ 5 dossiers forenses/mês",
      "✅ Alertas básicos",
      "✅ Exportar em PDF",
      "❌ Análise em lote",
      "❌ Integração API",
    ],
    cta: "Comprar",
    highlighted: false,
  },
  {
    id: "investigador",
    name: "Investigador",
    price: "R$ 149",
    description: "Para investigadores",
    credits: 1500,
    features: [
      "✅ Tudo do Starter",
      "✅ 150 consultas Chat IA",
      "✅ 30 dossiers forenses/mês",
      "✅ Alertas avançados",
      "✅ Análise de padrões",
      "✅ Comparação entre parlamentares",
      "❌ Integração API",
    ],
    cta: "Comprar",
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Sob consulta",
    description: "Para organizações",
    credits: 5000,
    features: [
      "✅ Tudo do Investigador",
      "✅ Análise ilimitada",
      "✅ Dossiers ilimitados",
      "✅ Integração API",
      "✅ Suporte prioritário",
      "✅ Customizações",
      "✅ Análise em lote",
    ],
    cta: "Contatar",
    highlighted: false,
  },
];

export default function VendasPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState("investigador");

  const handleCheckout = (plan) => {
    if (!user) {
      navigate("/login");
      return;
    }

    if (plan.id === "free") {
      navigate("/painel");
      return;
    }

    if (plan.id === "enterprise") {
      window.location.href = "mailto:vendas@transparenciabr.com.br";
      return;
    }

    // Iniciar checkout Stripe
    const stripe = window.Stripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);
    
    // Chamar Cloud Function para criar sessão
    fetch("https://southamerica-east1-transparenciabr.cloudfunctions.net/createCheckoutSession", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.getIdToken()}`,
      },
      body: JSON.stringify({
        packageId: plan.id,
        credits: plan.credits,
      }),
    })
      .then((res) => res.json())
      .then((data) => stripe.redirectToCheckout({ sessionId: data.id }))
      .catch((err) => console.error("Erro ao criar checkout:", err));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 py-12 px-4">
      <div className="mx-auto max-w-7xl">
        {/* Hero */}
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold text-white">
            Transparência sem limites
          </h1>
          <p className="mb-8 text-xl text-slate-300">
            Escolha o plano ideal para sua investigação
          </p>
        </div>

        {/* Planos */}
        <div className="mb-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col p-6 transition ${
                plan.highlighted
                  ? "border-2 border-blue-500 bg-slate-800 shadow-lg shadow-blue-500/20"
                  : "border border-slate-700 bg-slate-800/50"
              }`}
            >
              {plan.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                  MAIS POPULAR
                </div>
              )}

              <div className="mb-6">
                <h3 className="mb-2 text-lg font-bold text-white">{plan.name}</h3>
                <p className="mb-4 text-sm text-slate-400">{plan.description}</p>
                <div className="mb-2 text-3xl font-bold text-white">
                  {plan.price}
                </div>
                {plan.credits > 0 && (
                  <p className="text-sm text-slate-300">
                    {plan.credits.toLocaleString("pt-BR")} créditos
                  </p>
                )}
              </div>

              <div className="mb-6 flex-1 space-y-3">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="mt-0.5 flex-shrink-0">{feature.substring(0, 1)}</span>
                    <span>{feature.substring(2)}</span>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => handleCheckout(plan)}
                className={`w-full ${
                  plan.highlighted
                    ? "bg-blue-600 hover:bg-blue-700"
                    : "bg-slate-700 hover:bg-slate-600"
                }`}
              >
                {plan.cta}
              </Button>
            </Card>
          ))}
        </div>

        {/* Features Comparativas */}
        <div className="mb-16">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">
            Recursos por plano
          </h2>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border border-slate-700 bg-slate-800/50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Brain className="text-blue-400" />
                <h3 className="font-bold text-white">Chat com IA</h3>
              </div>
              <p className="text-sm text-slate-300">
                Análise forense com GEMINI 2.5 PRO. Faça perguntas sobre padrões de gastos,
                riscos e conexões políticas.
              </p>
            </Card>

            <Card className="border border-slate-700 bg-slate-800/50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Shield className="text-green-400" />
                <h3 className="font-bold text-white">Dossiers Forenses</h3>
              </div>
              <p className="text-sm text-slate-300">
                Relatórios completos com análise de risco, padrões de gastos e conexões
                suspeitas.
              </p>
            </Card>

            <Card className="border border-slate-700 bg-slate-800/50 p-6">
              <div className="mb-4 flex items-center gap-2">
                <Zap className="text-yellow-400" />
                <h3 className="font-bold text-white">Alertas em Tempo Real</h3>
              </div>
              <p className="text-sm text-slate-300">
                Notificações automáticas sobre novas despesas, emendas suspeitas e
                movimentações importantes.
              </p>
            </Card>
          </div>
        </div>

        {/* FAQ */}
        <div className="mb-16">
          <h2 className="mb-8 text-center text-2xl font-bold text-white">
            Perguntas frequentes
          </h2>

          <div className="space-y-4">
            {[
              {
                q: "Posso cancelar a qualquer momento?",
                a: "Sim, sem compromisso. Você pode cancelar sua assinatura quando quiser.",
              },
              {
                q: "Os créditos expiram?",
                a: "Créditos não expiram. Você pode usá-los quando quiser.",
              },
              {
                q: "Há limite de consultas ao Chat IA?",
                a: "Não, o limite é apenas pelo seu saldo de créditos.",
              },
              {
                q: "Posso fazer upgrade/downgrade?",
                a: "Sim, você pode mudar de plano a qualquer momento.",
              },
            ].map((item, idx) => (
              <Card
                key={idx}
                className="border border-slate-700 bg-slate-800/50 p-4"
              >
                <h3 className="mb-2 font-semibold text-white">{item.q}</h3>
                <p className="text-sm text-slate-300">{item.a}</p>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA Final */}
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-8 text-center">
          <h3 className="mb-4 text-2xl font-bold text-white">
            Pronto para investigar?
          </h3>
          <p className="mb-6 text-slate-300">
            Comece com o plano gratuito e faça upgrade quando precisar
          </p>
          <Button
            onClick={() => navigate("/painel")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Acessar Painel
          </Button>
        </div>
      </div>
    </div>
  );
}
