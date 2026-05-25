export default function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4 border-l-4 border-teal">
      <div className="text-xs uppercase tracking-wide text-info">{label}</div>
      <div className="font-display text-2xl text-teal-dark mt-1">{value}</div>
      {hint && <div className="text-xs text-info mt-1">{hint}</div>}
    </div>
  )
}
