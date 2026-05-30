/**
 * Ocean Ways — Page: Dashboard
 *
 * Centro de controle do usuário. Requer autenticação (ProtectedRoute).
 *
 * Seções:
 *   1. Resumo de créditos (CreditBadge grande + detalhes monthly/topup + rollover date)
 *   2. Alertas ativos (lista de AlertCard) + botão "Novo alerta"
 *   3. Histórico de buscas recentes (lista compacta)
 *   4. Histórico de transações (pagamentos)
 *
 * TODO (Maestro):
 *   [ ] Integrar com useCredits() para saldo em tempo real
 *   [ ] Integrar com useAlerts() para lista de alertas
 *   [ ] Integrar com api.getAlerts() e api.deactivateAlert()
 *   [ ] Integrar com api.getCreditBalance() e histórico
 *   [ ] Implementar modal "Novo alerta" com AlertForm
 *   [ ] Implementar botão "Upgrade Pro" se plano Free
 *   [ ] Dados exportáveis (direito LGPD à portabilidade) → link para /api/v1/auth/me/data
 */

import AlertCard from '../components/AlertCard.jsx'
import CreditBadge from '../components/CreditBadge.jsx'

export default function Dashboard() {
  // TODO: const { balance, creditsMonthly, creditsTopup, plan } = useCredits()
  // TODO: const { alerts, loading: alertsLoading } = useAlerts()

  const alerts = []  // placeholder

  return (
    <div className="min-h-screen bg-ocean-950 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-8">Dashboard</h1>

        {/* Seção créditos */}
        <section className="bg-ocean-900 rounded-2xl p-6 mb-6">
          <h2 className="text-ocean-300 text-sm font-medium mb-3">Seus créditos</h2>
          <div className="flex items-center gap-4">
            <CreditBadge balance={0} />
            {/* TODO: detalhes monthly + topup + renewal date */}
          </div>
          {/* TODO: botão "Comprar créditos" → /pricing */}
        </section>

        {/* Seção alertas */}
        <section className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-white font-semibold">Alertas ativos</h2>
            <button className="text-ocean-500 hover:text-ocean-300 text-sm transition-colors">
              + Novo alerta
              {/* TODO: abrir modal AlertForm */}
            </button>
          </div>
          {alerts.length === 0 ? (
            <p className="text-neutral-400 text-sm">Nenhum alerta configurado.</p>
          ) : (
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.alert_id}
                  alert={alert}
                  onDeactivate={(id) => {
                    // TODO: chamar api.deactivateAlert(id) + atualizar lista
                    console.log('TODO deactivate', id)
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* TODO: seção histórico de buscas */}
        {/* TODO: seção histórico de transações */}
        {/* TODO: link exportar dados (LGPD) */}
      </div>
    </div>
  )
}
