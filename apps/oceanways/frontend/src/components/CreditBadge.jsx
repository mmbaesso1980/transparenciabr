/**
 * Ocean Ways — Component: CreditBadge
 *
 * Badge compacto exibindo saldo atual de créditos do usuário.
 * Aparece na Navbar e no formulário de busca.
 *
 * Estados:
 *   - Normal: exibe saldo com ícone de moeda (gold-400)
 *   - Baixo (< 5 créditos): exibe saldo em vermelho com tooltip de aviso
 *   - Zero: exibe "0" + botão "Recarregar" → link /pricing
 *   - Carregando: skeleton loading
 *
 * Ao clicar: navegar para /dashboard#credits ou abrir modal de top-up
 *
 * TODO (Maestro):
 *   [ ] Conectar ao hook useCredits() que lê do Firestore users/{uid}
 *   [ ] Implementar estados Normal/Baixo/Zero/Loading
 *   [ ] Adicionar tooltip com detalhes (X créditos do plano + Y top-up)
 *   [ ] Implementar animação de diminuição quando crédito é debitado
 */

import { Coins } from 'lucide-react'

/**
 * @param {Object} props
 * @param {number} props.balance - Saldo total de créditos
 * @param {boolean} props.loading - Se está carregando
 *
 * TODO (Maestro): implementar lógica completa
 */
export default function CreditBadge({ balance = 0, loading = false }) {
  if (loading) {
    return (
      <div className="h-7 w-16 bg-ocean-700 rounded-full animate-pulse" />
    )
  }

  const isLow = balance > 0 && balance < 5
  const isEmpty = balance === 0

  return (
    <div
      className={[
        'flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium cursor-pointer transition-colors',
        isEmpty
          ? 'bg-red-900/50 text-red-400 hover:bg-red-800/50'
          : isLow
          ? 'bg-amber-900/50 text-amber-400 hover:bg-amber-800/50'
          : 'bg-ocean-800 text-gold-400 hover:bg-ocean-700',
      ].join(' ')}
      title={`Saldo: ${balance} créditos`}
      // TODO: onClick → navegar para /dashboard#credits ou abrir modal
    >
      <Coins size={14} aria-hidden="true" />
      <span>{balance}</span>
      {isEmpty && <span className="ml-1 text-xs">Recarregar</span>}
    </div>
  )
}
