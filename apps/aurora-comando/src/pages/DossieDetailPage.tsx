import { useParams, Link } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { useDossie, useAgents, useReviewers } from '../hooks/useDossies'
import { functions } from '../firebase/config'
import StatusBadge from '../components/StatusBadge'

const PHASES = ['ingest', 'analyze', 'synthesize', 'review', 'publish'] as const

export default function DossieDetailPage() {
  const { slug = '' } = useParams()
  const { dossie, loading } = useDossie(slug)
  const agents = useAgents(slug)
  const reviewers = useReviewers(slug)

  const phaseIdx = dossie?.phase ? PHASES.indexOf(dossie.phase as any) : -1

  const handleRerun = async () => {
    try {
      const fn = httpsCallable(functions, 'rerunReview')
      await fn({ slug })
      alert('Revisão re-iniciada. Acompanhe pelo /revisao.')
    } catch (err: any) {
      alert(`Falha ao re-rodar revisão: ${err.message}`)
    }
  }

  if (loading) return <div className="text-info">Carregando…</div>
  if (!dossie) return <div className="text-critica">Dossiê não encontrado.</div>

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/dossies" className="text-xs text-teal hover:underline">← voltar</Link>
          <h1 className="font-display text-2xl text-teal-dark">{dossie.alvo?.nome || dossie.slug}</h1>
          <p className="text-info text-sm">
            {dossie.alvo?.cargo || '—'} · {dossie.alvo?.partido || '—'} · CPF {dossie.alvo?.cpf_mask || '***.XXX.XXX-**'}
          </p>
        </div>
        <StatusBadge status={dossie.status} />
      </header>

      <section className="bg-white rounded-lg shadow-sm p-5">
        <h2 className="font-display text-lg text-teal-dark mb-3">Timeline</h2>
        <div className="flex flex-wrap gap-2">
          {PHASES.map((p, i) => (
            <div
              key={p}
              className={`flex-1 min-w-[80px] text-center text-xs py-2 rounded ${
                i < phaseIdx
                  ? 'bg-emerald-100 text-emerald-700'
                  : i === phaseIdx
                    ? 'bg-teal text-white'
                    : 'bg-info/10 text-info'
              }`}
            >
              {p}
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="font-display text-lg text-teal-dark mb-3">Revisores</h2>
          {reviewers.length === 0 && <p className="text-info text-sm">Revisão ainda não iniciada.</p>}
          <ul className="space-y-2">
            {reviewers.map((r) => (
              <li key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-info">{r.id}</span>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  r.state === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                  r.state === 'warnings' ? 'bg-media/15 text-media' :
                  r.state === 'rejected' ? 'bg-critica/15 text-critica' :
                  r.state === 'reviewing' ? 'bg-teal/15 text-teal-dark' :
                  'bg-info/15 text-info'
                }`}>{r.state}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-5">
          <h2 className="font-display text-lg text-teal-dark mb-3">Agentes ({agents.length})</h2>
          <div className="grid grid-cols-2 gap-1 text-xs max-h-64 overflow-y-auto">
            {agents.map((a) => (
              <div key={a.id} className="flex justify-between border-b py-1">
                <span className="truncate">{a.id}</span>
                <span className="text-info">{a.state}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-wrap gap-3">
        {dossie.pdf_url && (
          <a
            href={dossie.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-teal text-white px-4 py-2 rounded text-sm hover:bg-teal-dark"
          >
            Baixar PDF
          </a>
        )}
        <button
          onClick={handleRerun}
          className="bg-white border border-teal text-teal px-4 py-2 rounded text-sm hover:bg-teal hover:text-white"
        >
          Re-rodar revisão
        </button>
        <Link to={`/hq?slug=${slug}`} className="bg-bg border border-info/30 px-4 py-2 rounded text-sm hover:bg-white">
          Abrir no Escritório HQ
        </Link>
      </section>
    </div>
  )
}
