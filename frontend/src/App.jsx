import React from 'react';
import Galaxy3D from './components/Galaxy3D';

function App() {
  // ⚡ Bolt: Use lazy state initialization to prevent regenerating random numbers on every re-render.
  // Impact: Fixes 'react-hooks/purity' ESLint error and eliminates unnecessary O(N) array mapping during updates.
  const [financialStreams] = React.useState(() => {
    return [1, 2, 3, 4, 5, 6].map(i => ({
      id: i,
      value: Math.random() * 500000
    }));
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-6 font-satoshi flex flex-col">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-cabinet font-black text-slate-800 tracking-tight">TRANSPARÊNCIA BR <span className="text-sm align-top">🇧🇷</span></h1>
        <div className="flex space-x-4 text-sm font-medium text-slate-600">
          <span className="cursor-pointer hover:text-slate-900 border-b-2 border-slate-900 pb-1">OVERVIEW</span>
          <span className="cursor-pointer hover:text-slate-900">ENTITIES</span>
          <span className="cursor-pointer hover:text-slate-900">FINANCIALS</span>
        </div>
        <div className="flex items-center space-x-3">
           <button className="bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-slate-800 transition">LOGIN</button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-12 grid-rows-6 gap-4">
        {/* Radar / Entity Network Graph */}
        <div className="col-span-8 row-span-4 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden relative">
           <Galaxy3D />
        </div>

        {/* Asmodeus Risk Score */}
        <div className="col-span-4 row-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center justify-center">
           <h3 className="font-cabinet font-bold text-slate-500 uppercase tracking-wider text-xs mb-4 w-full text-left">Asmodeus Risk Score</h3>
           <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                 <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="10" />
                 <circle cx="50" cy="50" r="40" fill="transparent" stroke="#ef4444" strokeWidth="10" strokeDasharray="251.2" strokeDashoffset="62.8" className="transform -rotate-90 origin-center" />
              </svg>
              <div className="absolute flex flex-col items-center">
                 <span className="text-4xl font-black text-slate-800">87.4</span>
                 <span className="text-xs font-bold text-red-500 mt-1">HIGH RISK</span>
              </div>
           </div>
        </div>

        {/* Live Financial Streams */}
        <div className="col-span-4 row-span-4 bg-white rounded-xl shadow-sm border border-slate-200 p-6 overflow-hidden flex flex-col">
           <div className="flex justify-between items-center mb-4">
             <h3 className="font-cabinet font-bold text-slate-500 uppercase tracking-wider text-xs">Live Financial Streams</h3>
             <span className="px-2 py-1 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">LIVE FEED</span>
           </div>
           <div className="flex-1 overflow-y-auto pr-2 space-y-3">
              {financialStreams.map(stream => (
                <div key={stream.id} className="flex justify-between items-center border-b border-slate-100 pb-2 last:border-0">
                   <div>
                     <p className="text-sm font-bold text-slate-700">Dep. Federal {stream.id}</p>
                     <p className="text-xs text-slate-400">Emenda Parlamentar</p>
                   </div>
                   <p className="text-sm font-mono font-medium text-slate-800">R$ {stream.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                </div>
              ))}
           </div>
        </div>

        {/* System Status */}
        <div className="col-span-4 row-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
           <h3 className="font-cabinet font-bold text-slate-500 uppercase tracking-wider text-xs mb-4">System Status</h3>
           <div className="space-y-4">
             <div>
               <div className="flex justify-between text-sm mb-1">
                 <span className="font-medium text-slate-600 flex items-center"><span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span> Operational</span>
                 <span className="font-bold text-slate-800">100%</span>
               </div>
               <div className="w-full bg-slate-100 h-2 rounded-full"><div className="bg-green-500 h-2 rounded-full w-full"></div></div>
             </div>
             <div>
               <div className="flex justify-between text-sm mb-1">
                 <span className="font-medium text-slate-600 flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span> Asmodeus / ETL</span>
                 <span className="font-bold text-slate-800">117.4 ms</span>
               </div>
               <div className="w-full bg-slate-100 h-2 rounded-full"><div className="bg-blue-500 h-2 rounded-full w-3/4"></div></div>
             </div>
           </div>
        </div>

        {/* Top Investigations */}
        <div className="col-span-4 row-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-cabinet font-bold text-slate-500 uppercase tracking-wider text-xs mb-4">Top Investigations</h3>
            <div className="space-y-3">
               {['Investigação #890', 'Caso XYZ', 'Operação Beta'].map((inv, idx) => (
                 <div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded">
                    <span className="text-sm font-medium text-slate-700">{inv}</span>
                    <span className="text-xs font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded">ACTIVE</span>
                 </div>
               ))}
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;
