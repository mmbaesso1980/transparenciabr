/**
 * Ocean Ways — Component: AlertCard
 *
 * Card de exibição de um alerta de disponibilidade no Dashboard.
 *
 * Exibe:
 *   - Rota (origem → destino)
 *   - Janela de datas monitorada
 *   - Cabine e programas
 *   - Status: ATIVO / SUSPENSO (sem créditos)
 *   - Hits: quantas vezes disparou
 *   - Botão "Desativar" (soft delete)
 *
 * TODO (Maestro):
 *   [ ] Implementar props tipadas com shape de AlertResponse
 *   [ ] Implementar botão Desativar com confirm dialog
 *   [ ] Exibir badge SUSPENSO em vermelho quando active=false por falta de créditos
 *   [ ] Adicionar tooltip com próxima checagem (next_check_at)
 */

import { Bell, BellOff, Trash2 } from 'lucide-react'

/**
 * @param {Object} props
 * @param {Object} props.alert - AlertResponse do backend
 * @param {Function} props.onDeactivate - Callback ao desativar
 *
 * TODO (Maestro): implementar componente completo
 */
export default function AlertCard({ alert, onDeactivate }) {
  return (
    <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-4">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {alert?.active ? (
              <Bell size={14} className="text-gold-400" aria-hidden="true" />
            ) : (
              <BellOff size={14} className="text-red-400" aria-hidden="true" />
            )}
            <span className="text-white font-semibold">
              {alert?.origin || 'GRU'} → {alert?.destination || 'LHR'}
            </span>
            <span className={[
              'text-xs px-2 py-0.5 rounded-full font-medium',
              alert?.active ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
            ].join(' ')}>
              {alert?.active ? 'Ativo' : 'Suspenso'}
            </span>
          </div>
          <p className="text-ocean-300 text-sm">
            {alert?.cabin || 'BUSINESS'} · {alert?.dep_date_from} → {alert?.dep_date_to}
          </p>
          <p className="text-neutral-400 text-xs mt-1">
            {alert?.hits_count || 0} disparos
          </p>
        </div>
        <button
          onClick={() => onDeactivate?.(alert?.alert_id)}
          className="text-neutral-400 hover:text-red-400 transition-colors p-1"
          aria-label="Desativar alerta"
          // TODO: adicionar confirm dialog antes de desativar
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
