/**
 * Ocean Ways — Component: ResultCard
 *
 * Card de exibição de um resultado de availability de award flight.
 *
 * Exibe:
 *   - Companhia operadora (logo + nome)
 *   - Número do voo
 *   - Rota (origem → destino com horários)
 *   - Cabine (badge: ECONOMY / BUSINESS / FIRST)
 *   - Aliança (badge: STAR / SKYTEAM / ONEWORLD)
 *   - Programa de milhas
 *   - Custo em milhas (destaque — fonte mono, cor gold-400)
 *   - Taxas em BRL (menor destaque)
 *   - Assentos disponíveis (se informado pela fonte)
 *   - Botão "Ver detalhes" → link para site oficial do programa
 *
 * Aviso obrigatório (LGPD/TOS):
 *   "Dados informativos. Confirme disponibilidade diretamente no programa antes de transferir milhas."
 *
 * TODO (Maestro):
 *   [ ] Implementar props completas com AvailabilityResult shape
 *   [ ] Adicionar logos das companhias (public/airlines/)
 *   [ ] Implementar formatação de milhas com separador de milhar (pt-BR)
 *   [ ] Implementar badge de aliança com cor diferenciada por aliança
 *   [ ] Adicionar animação de entrada (fade-in, slide-up)
 *   [ ] Implementar modo "skeleton loading" enquanto carrega
 *   [ ] Link "Ver detalhes" deve abrir em nova aba com rel="noopener noreferrer"
 */

/**
 * @param {Object} props
 * @param {Object} props.result - AvailabilityResult do backend
 *
 * TODO (Maestro): implementar componente completo
 */
export default function ResultCard({ result }) {
  // TODO: implementar renderização completa

  // Formatação de milhas (ex: 57500 → "57.500")
  const formatMiles = (miles) =>
    miles != null ? miles.toLocaleString('pt-BR') : '—'

  const formatBRL = (value) =>
    value != null
      ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—'

  return (
    <div className="bg-ocean-900 border border-ocean-700 rounded-xl p-5 hover:border-ocean-500 transition-colors">
      {/* TODO: implementar layout completo */}
      <div className="flex justify-between items-start">
        <div>
          <p className="text-white font-semibold">{result?.program || 'TODO'}</p>
          <p className="text-ocean-300 text-sm">{result?.operating_carrier || ''} · {result?.cabin || ''}</p>
        </div>
        <div className="text-right">
          <p className="text-gold-400 font-mono text-xl font-bold">
            {formatMiles(result?.miles_cost)} mi
          </p>
          <p className="text-neutral-400 text-xs">
            + {formatBRL(result?.taxes_brl)} em taxas
          </p>
        </div>
      </div>

      {/* Aviso TOS obrigatório */}
      <p className="mt-3 text-neutral-500 text-xs border-t border-ocean-700 pt-2">
        Dados informativos. Confirme disponibilidade no programa antes de transferir milhas.
      </p>
    </div>
  )
}
