import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDossies, type DossieStatus } from '../hooks/useDossies'
import StatusBadge from '../components/StatusBadge'

const PAGE_SIZE = 20
const statusFilters: Array<DossieStatus | 'all'> = ['all', 'queued', 'running', 'reviewing', 'done', 'error']

export default function DossieListPage() {
  const { dossies, loading } = useDossies()
  const [filter, setFilter] = useState<DossieStatus | 'all'>('all')
  const [page, setPage] = useState(0)

  const filtered = filter === 'all' ? dossies : dossies.filter((d) => d.status === filter)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <div>
      <h1 className="font-display text-2xl text-teal-dark mb-4">Dossiês</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => { setFilter(s); setPage(0) }}
            className={`text-sm px-3 py-1 rounded border ${
              filter === s ? 'bg-teal text-white border-teal' : 'bg-white text-info border-info/30 hover:bg-bg'
            }`}
          >
            {s === 'all' ? 'Todos' : s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-teal/10 text-teal-dark">
            <tr>
              <th className="text-left px-3 py-2">Alvo</th>
              <th className="text-left px-3 py-2">Partido</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Fase</th>
              <th className="text-left px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-3 py-4 text-info">Carregando…</td></tr>
            )}
            {!loading && slice.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-info">Nenhum dossiê encontrado.</td></tr>
            )}
            {slice.map((d) => (
              <tr key={d.id} className="border-t hover:bg-bg">
                <td className="px-3 py-2 text-teal-dark">{d.alvo?.nome || d.slug}</td>
                <td className="px-3 py-2 text-info">{d.alvo?.partido || '—'}</td>
                <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                <td className="px-3 py-2 text-info">{d.phase || '—'}</td>
                <td className="px-3 py-2">
                  <Link to={`/dossies/${d.slug}`} className="text-teal hover:underline">ver</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-3 mt-4 text-sm">
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="px-2 py-1 disabled:opacity-40">‹</button>
          <span>Página {page + 1} de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} className="px-2 py-1 disabled:opacity-40">›</button>
        </div>
      )}
    </div>
  )
}
