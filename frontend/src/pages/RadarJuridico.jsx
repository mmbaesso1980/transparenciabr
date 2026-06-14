import React, { useState } from 'react';

// Mock data for KPIs and Leads - this would come from an API
const kpis = [
  { label: 'Leads Qualificados', value: '2.150' },
  { label: 'Municípios Cobertos', value: '31' },
  { label: 'Espécie Dominante', value: 'Auxílio Doença' },
  { label: 'Score Médio', value: '8.2' },
];

const leads = [
  // Populate with a few examples based on the project's data
  { id: 1, nome: 'Lead de Serra/ES', especie: 'Auxílio Doença', motivo: 'Não Constatação Incapacidade', score: 9.5, severidade: 'alta' },
  { id: 2, nome: 'Lead de Cachoeiro/ES', especie: 'Auxílio Doença', motivo: 'Não Constatação Incapacidade', score: 9.2, severidade: 'alta' },
  { id: 3, nome: 'Lead de Vitória/ES', especie: 'Auxílio Doença', motivo: 'Dados Insuficientes', score: 8.8, severidade: 'media' },
  { id: 4, nome: 'Lead de Vila Velha/ES', especie: 'Auxílio Doença', motivo: 'Não Constatação Incapacidade', score: 8.5, severidade: 'media' },
  { id: 5, nome: 'Lead de Campinas/SP', especie: 'Aposentadoria Invalidez', motivo: 'Perícia Contrária', score: 7.9, severidade: 'baixa' },
];

const severidadeCores = {
  alta: 'border-red-500',
  media: 'border-orange-500',
  baixa: 'border-yellow-500',
};

const RadarJuridico = () => {
  const [filters, setFilters] = useState({ uf: 'todos', especie: 'todos' });

  const handleFilterChange = (e) => {
    setFilters({ ...filters, [e.target.name]: e.target.value });
  };

  return (
    <div className="bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 dm-sans">Radar Jurídico</h1>
        <p className="mt-1 text-lg text-gray-600 inter">Leads de direitos previdenciários identificados pelo motor AURORA.</p>

        {/* KPIs Section */}
        <section className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map(kpi => (
            <div key={kpi.label} className="bg-white p-4 rounded-lg shadow text-center">
              <p className="text-2xl font-bold text-teal-600">{kpi.value}</p>
              <p className="text-sm text-gray-500">{kpi.label}</p>
            </div>
          ))}
        </section>

        {/* Filters Section */}
        <section className="mt-8 bg-white p-4 rounded-lg shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="uf" className="block text-sm font-medium text-gray-700">UF</label>
              <select id="uf" name="uf" onChange={handleFilterChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                <option value="todos">Todos</option>
                <option value="ES">Espírito Santo</option>
                <option value="SP">São Paulo</option>
                <option value="PR">Paraná</option>
              </select>
            </div>
            <div>
              <label htmlFor="especie" className="block text-sm font-medium text-gray-700">Espécie</label>
              <select id="especie" name="especie" onChange={handleFilterChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                <option value="todos">Todas</option>
                <option value="auxilio_doenca">Auxílio Doença</option>
                <option value="aposentadoria_invalidez">Aposentadoria por Invalidez</option>
              </select>
            </div>
             <div>
              <label htmlFor="score" className="block text-sm font-medium text-gray-700">Score Mínimo</label>
               <input type="range" id="score" name="score" min="0" max="10" step="0.1" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
            </div>
          </div>
        </section>

        {/* Leads Grid Section */}
        <section className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {leads.map(lead => (
              <div key={lead.id} className={`bg-white rounded-lg shadow overflow-hidden border-l-4 ${severidadeCores[lead.severidade]}`}>
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <h3 className="text-lg font-bold dm-sans">{lead.nome}</h3>
                    <span className="bg-teal-100 text-teal-800 text-sm font-medium px-2.5 py-0.5 rounded-full">{lead.score}</span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    <span className="font-semibold">Espécie:</span> {lead.especie}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    <span className="font-semibold">Motivo:</span> {lead.motivo}
                  </p>
                   <button className="mt-4 w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700">
                    Ver Detalhes
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
};

export default RadarJuridico;
