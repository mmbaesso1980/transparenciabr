import { Link } from 'react-router-dom'
import { useDossies } from '../hooks/useDossies'
import { useFCM } from '../hooks/useFCM'
import KpiCard from '../components/KpiCard'
import StatusBadge from '../components/StatusBadge'

export default function DashboardPage() {
  const { dossies, loading } = useDossies()
  const { permission, requestPermission } = useFCM()

  const total = dossies.length
  const running = dossies.filter((d) => d.status === 'running').length
  const reviewing = dossies.filter((d) => d.status === 'reviewing').length
  const today = new Date().toISOString().slice(0, 10)
  const publishedToday = dossies.filter(
    (d) => d.status === 'done' && d.updated_at?.toDate?.()?.toISOString().slice(0, 10) === today
  ).length
  const monthCost = (dossies.filter((d) => d.status === 'done').length * 1.56).toFixed(2)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-teal-dark">Bem-vindo, Comandante</h1>
        <p className="text-info text-sm mt-1">Visão geral do pipeline AURORA Forensic.</p>
      </header>

      {permission !== 'granted' && (
        <div className="bg-teal/10 border border-teal/30 rounded p-3 flex items-center justify-between">
          <span className="text-sm text-teal-dark">Ativar notificações de conclusão de dossiê.</span>
          <button onClick={requestPermission} className="text-sm bg-teal text-white px-3 py-1 rounded">
            Permitir
          </button>
        </div>
      )}

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KpiCard label="Dossiês total" value={loading ? '…' : total} />
        <KpiCard label="Em andamento" value={running} />
        <KpiCard label="Em revisão" value={reviewing} />
        <KpiCard label="Publicados hoje" value={publishedToday} />
        <KpiCard label="Custo do mês" value={`R$ ${monthCost}`} hint="≈ R$ 1,56 / dossiê" />
        <KpiCard label="Créditos codex-br" value="R$ 5.677" hint="expira 03/05/2027" />
      </section>

      <section className="bg-white rounded-lg shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-teal-dark">Dossiês recentes</h2>
          <Link to="/dossies" className="text-sm text-teal hover:underline">ver todos →</Link>
        </div>
        {loading && <p className="text-info text-sm">Carregando…</p>}
        {!loading && dossies.length === 0 && (
          <p className="text-info text-sm">Nenhum dossiê registrado ainda.</p>
        )}
        <ul className="divide-y">
          {dossies.slice(0, 5).map((d) => (
            <li key={d.id} className="py-2 flex items-center justify-between">
              <Link to={`/dossies/${d.slug}`} className="text-teal-dark hover:underline">
                {d.alvo?.nome || d.slug}
              </Link>
              <StatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      </section>

      <Link
        to="/hq"
        className="block bg-teal text-white rounded-lg p-5 text-center hover:bg-teal-dark transition-colors"
      >
        <div className="font-display text-xl">🏢 Abrir Escritório HQ</div>
        <div className="text-sm opacity-80 mt-1">Veja os 22 agentes trabalhando em tempo real</div>
      </Link>
    </div>
  )
}
