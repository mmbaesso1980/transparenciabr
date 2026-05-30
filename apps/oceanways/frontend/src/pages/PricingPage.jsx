/**
 * Ocean Ways — Page: PricingPage
 *
 * Página de planos e preços.
 *
 * Layout:
 *   - 3 cards: Free | Pro (destaque) | Top-up
 *   - Tabela comparativa de features
 *   - FAQ sobre créditos
 *   - CTA: Upgrade Pro (→ checkout)
 *
 * TODO (Maestro):
 *   [ ] Implementar 3 PricingCard components
 *   [ ] Botão "Assinar Pro" → createCheckout({ product: "PLAN_PRO", gateway: "STRIPE" })
 *   [ ] Botão "Comprar Top-up" → createCheckout({ product: "TOPUP_100", gateway: "STRIPE" })
 *   [ ] Toggle Stripe / MercadoPago para preferência do usuário
 *   [ ] Destacar plano atual do usuário (badge "Seu plano")
 *   [ ] FAQ: perguntas sobre expiração, rollover, reembolso
 */

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-ocean-950 py-16 px-4">
      <div className="max-w-5xl mx-auto text-center">
        <h1 className="text-3xl font-bold text-white mb-3">Planos simples</h1>
        <p className="text-ocean-300 mb-12">
          1 crédito por busca. 2 por alerta. Simples assim.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Free */}
          <div className="bg-ocean-900 border border-ocean-700 rounded-2xl p-6 text-left">
            <h2 className="text-white font-bold text-xl mb-1">Free</h2>
            <p className="text-3xl font-bold text-white mb-4">R$ 0</p>
            <ul className="text-ocean-300 text-sm space-y-2">
              <li>✓ 30 créditos/mês</li>
              <li>✓ 2 alertas ativos</li>
              <li>✗ Sem rollover</li>
            </ul>
            {/* TODO: botão signup */}
          </div>

          {/* Pro — destaque */}
          <div className="bg-ocean-700 border-2 border-gold-400 rounded-2xl p-6 text-left relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gold-400 text-ocean-950 text-xs font-bold px-3 py-1 rounded-full">
              Mais popular
            </div>
            <h2 className="text-white font-bold text-xl mb-1">Pro</h2>
            <p className="text-3xl font-bold text-gold-400 mb-4">R$ 49<span className="text-lg text-white">/mês</span></p>
            <ul className="text-ocean-100 text-sm space-y-2">
              <li>✓ 600 créditos/mês</li>
              <li>✓ Alertas ilimitados</li>
              <li>✓ Rollover 200 créditos</li>
              <li>✓ Prioridade na fila</li>
            </ul>
            <button className="mt-6 w-full bg-gold-400 hover:bg-gold-600 text-ocean-950 font-bold py-2.5 rounded-lg transition-colors">
              {/* TODO: chamar createCheckout */}
              Assinar Pro
            </button>
          </div>

          {/* Top-up */}
          <div className="bg-ocean-900 border border-ocean-700 rounded-2xl p-6 text-left">
            <h2 className="text-white font-bold text-xl mb-1">Top-up</h2>
            <p className="text-3xl font-bold text-white mb-4">R$ 10</p>
            <ul className="text-ocean-300 text-sm space-y-2">
              <li>✓ 100 créditos avulsos</li>
              <li>✓ Sem expiração</li>
              <li>✓ Acumula com plano</li>
            </ul>
            <button className="mt-6 w-full bg-ocean-500 hover:bg-ocean-300 hover:text-ocean-950 text-white font-bold py-2.5 rounded-lg transition-colors">
              {/* TODO: chamar createCheckout */}
              Comprar
            </button>
          </div>
        </div>

        {/* TODO: tabela comparativa detalhada */}
        {/* TODO: FAQ sobre créditos */}
      </div>
    </div>
  )
}
