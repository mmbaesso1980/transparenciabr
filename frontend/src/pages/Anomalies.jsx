import React, { useState } from 'react';

// Mock data for KPIs and Anomalies
const kpis = [
  { label: 'Anomalias Detectadas', value: '482' },
  { label: 'Parlamentares com Anomalias', value: '73' },
  { label: 'Valor Sob Análise', value: 'R$ 1.2M' },
  { label: 'Anomalia Mais Comum', value: 'Z-Score Combustível' },
];

const anomalies = [
  { id: 1, politico: 'Dep. Fulano de Tal', tipo: 'Z-Score > 3 (Combustível)', valor: 'R$ 15.200,00', score: 9.8, severidade: 'critica' },
  { id: 2, politico: 'Dep. Ciclano da Silva', tipo: 'Lei de Benford (Alimentação)', valor: 'R$ 8.900,00', score: 9.1, severidade: 'alta' },
  { id: 3, politico: 'Sen. Beltrano Souza', tipo: 'Fornecedor Exclusivo', valor: 'R$ 120.000,00', score: 8.5, severidade: 'alta' },
  { id: 4, politico: 'Dep. Fulano de Tal', tipo: 'Empresa-Clone', valor: 'R$ 45.000,00', score: 7.8, severidade: 'media' },
  { id: 5, politico: 'Dep. Ciclano da Silva', tipo: 'Z-Score > 2 (Gráfica)', valor: 'R$ 22.100,00', score: 7.2, severidade: 'media' },
];

const severidadeCores = {
  critica: 'border-red-700',
  alta: 'border-red-500',
  media: 'border-orange-500',
  baixa: 'border-yellow-500',
};

const Anomalies = () => {
  return (
    <div className="bg-gray-50 p-4 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 dm-sans">Anomalias CEAP</h1>
        <p className="mt-1 text-lg text-gray-600 inter">Anomalias estatísticas nos gastos da Cota Parlamentar (motor AURORA).</p>

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
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="politico" className="block text-sm font-medium text-gray-700">Parlamentar</label>
              <input type="text" id="politico" name="politico" placeholder="Nome do parlamentar..." className="mt-1 block w-full p-2 border border-gray-300 rounded-md"/>
            </div>
            <div>
              <label htmlFor="uf" className="block text-sm font-medium text-gray-700">UF</label>
              <select id="uf" name="uf" className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                <option value="todos">Todos</option>
                <option value="SP">SP</option>
                <option value="RJ">RJ</option>
                <option value="PE">PE</option>
              </select>
            </div>
            <div>
              <label htmlFor="tipo_anomalia" className="block text-sm font-medium text-gray-700">Tipo de Anomalia</label>
              <select id="tipo_anomalia" name="tipo_anomalia" className="mt-1 block w-full p-2 border border-gray-300 rounded-md">
                <option value="todos">Todos</option>
                <option value="z_score">Z-Score</option>
                <option value="benford">Lei de Benford</option>
                <option value="fornecedor">Fornecedor</option>
              </select>
            </div>
             <div>
              <label htmlFor="severidade" className="block text-sm font-medium text-gray-700">Severidade Mínima</label>
               <input type="range" id="severidade" name="severidade" min="0" max="10" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"/>
            </div>
          </div>
        </section>

        {/* Anomalies Grid Section */}
        <section className="mt-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {anomalies.map(item => (
              <div key={item.id} className={`bg-white rounded-lg shadow overflow-hidden border-l-4 ${severidadeCores[item.severidade]}`}>
                <div className="p-5">
                  <div className="flex justify-between items-start">
                     <p className="text-sm font-semibold text-gray-700">{item.politico}</p>
                    <span className="bg-red-100 text-red-800 text-sm font-medium px-2.5 py-0.5 rounded-full">{item.score}</span>
                  </div>
                  <h3 className="mt-2 text-lg font-bold dm-sans">{item.tipo}</h3>
                  <p className="mt-2 text-2xl font-semibold text-gray-800">
                    {item.valor}
                  </p>
                   <button className="mt-4 w-full px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700">
                    Analisar Dossiê
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

export default Anomalies;
