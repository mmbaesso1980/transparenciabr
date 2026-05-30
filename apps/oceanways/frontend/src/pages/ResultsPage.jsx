/**
 * Ocean Ways — Page: ResultsPage
 *
 * Exibe resultados de uma busca de award flights.
 *
 * URL: /results?id={search_id}
 *
 * Fluxo:
 *   1. Ler search_id da query string
 *   2. Se search_id presente: buscar resultados cached ou aguardar polling
 *   3. Exibir lista de ResultCard ordenada por miles_cost
 *   4. Filtros laterais: cabine, aliança, programa, max milhas
 *   5. Exibir aviso de cache hit (dado de até X horas atrás)
 *   6. Botão "Nova busca" → /search
 *
 * TODO (Maestro):
 *   [ ] Ler search_id de useSearchParams()
 *   [ ] Implementar GET /search/{search_id} para buscar resultado
 *   [ ] Implementar filtros lado cliente (não rebuscar para filtrar)
 *   [ ] Implementar ordenação: milhas, taxas, duração
 *   [ ] Exibir ResultCard para cada AvailabilityResult
 *   [ ] Estado vazio (nenhum resultado encontrado)
 */

import ResultCard from '../components/ResultCard.jsx'

export default function ResultsPage() {
  // TODO: const [searchParams] = useSearchParams()
  // const searchId = searchParams.get('id')
  // const { results, loading, error, cacheHit } = useSearchResults(searchId)

  const results = []  // placeholder

  return (
    <div className="min-h-screen bg-ocean-950 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Resultados</h1>
        {/* TODO: exibir info da busca (rota, data, cabine) */}

        {results.length === 0 ? (
          <p className="text-ocean-300 mt-6">
            TODO: sem resultados — aggregator não implementado
          </p>
        ) : (
          <div className="space-y-4 mt-6">
            {results.map((r) => (
              <ResultCard key={r.result_id} result={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
