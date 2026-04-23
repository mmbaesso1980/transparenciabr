import React from 'react';

export default function LandingComercial() {
  return (
    <div className="bg-slate-950 text-white min-h-screen">
      <header className="p-8 text-center">
        <h1 className="text-4xl font-bold text-indigo-500">TransparênciaBR</h1>
        <p className="text-xl mt-4 text-slate-300">O dossiê político mais completo do Brasil</p>
      </header>

      <section className="max-w-4xl mx-auto p-4 grid gap-8 md:grid-cols-3">
        <div className="bg-slate-900/50 backdrop-blur border border-white/10 p-6 rounded-2xl">
          <h2 className="text-2xl mb-2 text-amber-500">Starter</h2>
          <p className="text-slate-400 mb-4">Ideal para análises pontuais</p>
          <p className="text-3xl font-bold">R$ 19,90<span className="text-sm font-normal">/100cr</span></p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur border border-indigo-500/50 p-6 rounded-2xl relative">
          <div className="absolute top-0 right-0 bg-indigo-500 text-xs px-2 py-1 rounded-bl-lg rounded-tr-xl">Popular</div>
          <h2 className="text-2xl mb-2 text-indigo-400">Pro</h2>
          <p className="text-slate-400 mb-4">Investigações profundas</p>
          <p className="text-3xl font-bold">R$ 79,90<span className="text-sm font-normal">/500cr</span></p>
        </div>

        <div className="bg-slate-900/50 backdrop-blur border border-white/10 p-6 rounded-2xl">
          <h2 className="text-2xl mb-2 text-emerald-500">Enterprise</h2>
          <p className="text-slate-400 mb-4">Para redações e auditorias</p>
          <p className="text-3xl font-bold">R$ 249,90<span className="text-sm font-normal">/2000cr</span></p>
        </div>
      </section>

      <footer className="p-8 text-center text-slate-500 text-sm mt-12">
        <p>Este portal utiliza dados públicos oficiais. Os scores e alertas são indicadores probabilísticos. Para denúncias formais, procure o Ministério Público, TCU ou CGU.</p>
      </footer>
    </div>
  );
}
