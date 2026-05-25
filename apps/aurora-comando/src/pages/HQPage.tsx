export default function HQPage() {
  return (
    <div className="bg-white rounded-lg shadow-sm p-8 text-center">
      <h1 className="font-display text-2xl text-teal-dark mb-3">Escritório HQ</h1>
      <p className="text-info mb-6">
        A versão pixel-art em tempo real dos 22 agentes está disponível no frontend principal.
      </p>
      <a
        href="https://transparenciabr.web.app/escritorio-hq"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block bg-teal text-white px-6 py-3 rounded font-display hover:bg-teal-dark"
      >
        Abrir Escritório HQ →
      </a>
      <p className="text-xs text-info mt-4">Em uma versão futura, o escritório será embutido aqui dentro.</p>
    </div>
  )
}
