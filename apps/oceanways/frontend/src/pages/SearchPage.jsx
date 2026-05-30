/**
 * Ocean Ways — Page: SearchPage
 *
 * Página de busca de award flights.
 *
 * Layout:
 *   - SearchForm (à esquerda ou topo)
 *   - Loading state durante busca (skeleton cards)
 *   - Erro state (saldo insuficiente, fonte indisponível)
 *
 * Fluxo:
 *   Submit → POST /api/v1/search → loading → redirect para /results?id={search_id}
 *
 * TODO (Maestro):
 *   [ ] Integrar SearchForm com hook useSearch()
 *   [ ] Implementar loading skeleton (5 ResultCard skeletons)
 *   [ ] Implementar estado de erro com mensagem amigável
 *   [ ] Ao receber search_id, navegar para /results com react-router navigate()
 */

import SearchForm from '../components/SearchForm.jsx'

export default function SearchPage() {
  const handleSearch = async (params) => {
    // TODO: chamar api.searchAwards(params) → navigate('/results?id=...')
    console.log('TODO: search', params)
  }

  return (
    <div className="min-h-screen bg-ocean-950 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-6">Buscar Award Flights</h1>
        <SearchForm onSubmit={handleSearch} />
      </div>
    </div>
  )
}
