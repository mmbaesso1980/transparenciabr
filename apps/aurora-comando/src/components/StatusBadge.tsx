import type { DossieStatus } from '../hooks/useDossies'

const map: Record<DossieStatus, { label: string; cls: string }> = {
  queued: { label: 'Em fila', cls: 'bg-info/15 text-info' },
  running: { label: 'Processando', cls: 'bg-teal/15 text-teal-dark' },
  reviewing: { label: 'Em revisão', cls: 'bg-media/15 text-media' },
  done: { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700' },
  error: { label: 'Erro', cls: 'bg-critica/15 text-critica' }
}

export default function StatusBadge({ status }: { status: DossieStatus }) {
  const m = map[status] || { label: status, cls: 'bg-info/15 text-info' }
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${m.cls}`}>{m.label}</span>
}
