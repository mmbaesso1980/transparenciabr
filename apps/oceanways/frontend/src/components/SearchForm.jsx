/**
 * Ocean Ways — Component: SearchForm
 *
 * Formulário principal de busca de award flights.
 *
 * Campos:
 *   - Origem (IATA) — autocomplete de aeroportos
 *   - Destino (IATA) — autocomplete de aeroportos
 *   - Data de partida — date picker
 *   - Data de retorno — date picker (opcional, para roundtrip)
 *   - Cabine — select: ECONOMY | BUSINESS | FIRST
 *   - Programas — multi-select checkbox (Smiles, United, Flying Blue, etc.)
 *   - Máx. milhas — input numérico opcional
 *
 * On submit:
 *   1. Verificar autenticação (se não logado → redirect /login)
 *   2. Verificar saldo de créditos (exibir badge)
 *   3. POST /api/v1/search com payload
 *   4. Loading state durante busca
 *   5. Redirecionar para /results com search_id
 *
 * TODO (Maestro):
 *   [ ] Implementar autocomplete de aeroportos (lista IATA ou API de sugestões)
 *   [ ] Implementar date picker acessível (aria-label, keyboard nav)
 *   [ ] Implementar multi-select de programas com checkboxes
 *   [ ] Conectar ao hook useSearch() (services/api.js)
 *   [ ] Mostrar CreditBadge no canto do formulário
 *   [ ] Validação de formulário (origem != destino, data >= hoje)
 *   [ ] Loading spinner no botão durante busca
 *   [ ] Tratamento de erro (ex: saldo insuficiente → link para /pricing)
 */

/**
 * @param {Object} props
 * @param {Function} props.onSubmit - Callback quando busca é iniciada
 *
 * TODO (Maestro): implementar componente completo
 */
export default function SearchForm({ onSubmit }) {
  // TODO: implementar state para cada campo
  // const [origin, setOrigin] = useState('')
  // const [destination, setDestination] = useState('')
  // const [depDate, setDepDate] = useState('')
  // const [retDate, setRetDate] = useState('')
  // const [cabin, setCabin] = useState('ECONOMY')
  // const [programs, setPrograms] = useState([])
  // const [loading, setLoading] = useState(false)

  return (
    <div className="bg-ocean-900 rounded-2xl p-6 shadow-lg">
      <h2 className="text-xl font-bold text-white mb-4">
        Buscar Award Flights
      </h2>
      {/* TODO: implementar form completo */}
      <p className="text-neutral-400 text-sm">
        TODO: formulário de busca não implementado — scaffold apenas
      </p>
    </div>
  )
}
