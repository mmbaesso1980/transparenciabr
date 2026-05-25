import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDossies } from '../hooks/useDossies'

export default function ReviewPage() {
  const { dossies, loading } = useDossies()
  const [expanded, setExpanded] = useState<string | null>(null)
  const inReview = dossies.filter((d) => d.status === 'reviewing' || d.status === 'done')

  return (
    <div>
      <h1 className="font-display text-2xl text-teal-dark mb-4">Revisão automatizada</h1>
      <p className="text-info text-sm mb-4">
        6 agentes revisores analisam cada dossiê antes da publicação: fonte primária, tom, contraditório,
        falso positivo, máscara PII e severidade.
      </p>

      {loading && <div className="text-info">Carregando…</div>}
      {!loading && inReview.length === 0 && (
        <div className="bg-white p-4 rounded text-info text-sm">Nenhum dossiê em revisão no momento.</div>
      )}

      <ul className="space-y-2">
        {inReview.map((d) => (
          <li key={d.id} className="bg-white rounded shadow-sm">
            <button
              onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              className="w-full px-4 py-3 flex justify-between items-center text-left"
            >
              <div>
                <div className="text-teal-dark font-display">{d.alvo?.nome || d.slug}</div>
                <div className="text-xs text-info">{d.status} · {d.phase || '—'}</div>
              </div>
              <span className="text-teal">{expanded === d.id ? '−' : '+'}</span>
            </button>
            {expanded === d.id && (
              <div className="px-4 pb-4 text-sm text-info">
                {d.review_warnings && d.review_warnings.length > 0 ? (
                  <ul className="list-disc pl-5 space-y-1">
                    {d.review_warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                ) : (
                  <p>Sem warnings de revisão registrados.</p>
                )}
                <Link to={`/dossies/${d.slug}`} className="inline-block mt-2 text-teal hover:underline">
                  ver detalhe completo →
                </Link>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
