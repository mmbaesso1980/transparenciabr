import React from 'react';

export default function ForensicPanel({ node, isPremium, onClose }) {
  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-slate-800 text-white p-6 shadow-2xl overflow-y-auto border-l border-slate-700 z-20">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white">✕</button>
      <h2 className="text-xl font-cabinet font-bold mb-2">{node.name}</h2>
      <div className="mb-4">
        <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">{node.partido || 'S/P'}</span>
      </div>

      <div className="space-y-4">
        <div className="p-3 bg-slate-900 rounded border border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Gastos Totais</p>
          <p className="text-lg font-mono">R$ {(node.value || 0).toLocaleString('pt-BR')}</p>
        </div>

        <div className="p-3 bg-slate-900 rounded border border-slate-700">
          <p className="text-xs text-slate-400 uppercase tracking-wider">Risk Score</p>
          <div className="flex items-center mt-1">
            <div className={`w-3 h-3 rounded-full mr-2 ${(node.score_risco || 0) > 7.5 ? 'bg-asmodeus-red' : 'bg-green-500'}`}></div>
            <p className="text-lg font-bold">{node.score_risco || 0}</p>
          </div>
        </div>

        {isPremium ? (
           <div className="p-3 bg-indigo-900/30 border border-indigo-500/50 rounded mt-4">
             <h4 className="text-sm font-bold text-indigo-300 mb-1">Dossiê Completo</h4>
             <p className="text-xs text-indigo-200/70 mb-2">Acesso auditor liberado.</p>
             <button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-2 rounded transition-colors">
               Visualizar Triangulação
             </button>
           </div>
        ) : (
           <div className="p-3 bg-slate-800 border border-slate-600 rounded mt-4 opacity-75">
             <h4 className="text-sm font-bold text-slate-300 mb-1">Dossiê Completo</h4>
             <p className="text-xs text-slate-400 mb-2">Disponível no plano Premium.</p>
             <button className="w-full bg-slate-700 text-slate-300 text-xs py-2 rounded cursor-not-allowed">
               Desbloquear Acesso
             </button>
           </div>
        )}
      </div>
    </div>
  );
}
