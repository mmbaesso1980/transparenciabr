import React from 'react';
import { Link } from 'react-router-dom';

// Mock data for highlight cards - in a real app, this would come from an API
const highlights = [
  {
    type: 'Dossiê',
    title: 'Dossiê Forense: Dep. Exemplo',
    description: 'Análise detalhada de gastos e emendas do parlamentar.',
    link: '/dossie/dep-exemplo',
  },
  {
    type: 'Anomalia',
    title: 'Gasto com combustível 3x acima da média',
    description: 'Um padrão de gasto estatisticamente anômalo foi detectado.',
    link: '/anomalies/123',
  },
  {
    type: 'Radar Jurídico',
    title: 'Novos Leads Qualificados',
    description: 'Explore os últimos leads de direitos previdenciários identificados.',
    link: '/radar-juridico',
  },
];

const Home = () => {
  return (
    <div className="bg-gray-50 text-gray-800">
      {/* Hero Section */}
      <section className="text-center py-20 bg-white">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-teal-700 dm-sans">
            Fiscalização Cidadã. Potencializada por Inteligência Artificial.
          </h1>
          <p className="mt-4 text-xl text-gray-600 inter">
            Não denunciamos. Mostramos.
          </p>
          <div className="mt-8 max-w-2xl mx-auto">
            <div className="relative">
              <input
                type="search"
                placeholder="Pesquise por parlamentar, município, tema..."
                className="w-full p-4 border border-gray-300 rounded-full shadow-sm focus:ring-teal-500 focus:border-teal-500"
              />
              <button className="absolute right-0 top-0 mt-2 mr-2 px-6 py-2 bg-teal-600 text-white rounded-full hover:bg-teal-700">
                Buscar
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Highlights Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {highlights.map((item, index) => (
              <div key={index} className="bg-white p-6 rounded-lg shadow-md hover:shadow-xl transition-shadow">
                <p className="text-sm font-semibold text-teal-600">{item.type}</p>
                <h3 className="mt-2 text-xl font-bold dm-sans">{item.title}</h3>
                <p className="mt-2 text-gray-600 inter">{item.description}</p>
                <Link to={item.link} className="mt-4 inline-block text-teal-600 hover:text-teal-800 font-semibold">
                  Ver mais &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
