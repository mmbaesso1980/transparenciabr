import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * BentoModal — Overlay full-screen ao clicar num card.
 * Mostra ranking dos 513 parlamentares filtravel/ordenavel.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - title: string
 *  - subtitle: string (opcional)
 *  - data: array de parlamentares
 *  - sortKey: 'cota' | 'frugalidade' | 'score' | 'sinalizacoes' | 'presenca' (default: 'cota')
 *  - valueLabel: string (rótulo da coluna de valor — ex: "Cota R$")
 *  - valueFormatter: (item) => string (default formata a sortKey)
 */
function fmtMoney(v) {
  return v?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
}

export default function BentoModal({
  open,
  onClose,
  title,
  subtitle,
  data = [],
  sortKey = 'cota',
  valueLabel = 'Cota',
  valueFormatter,
}) {
  const [query, setQuery] = useState('');
  const [partidoFiltro, setPartidoFiltro] = useState('');
  const [ufFiltro, setUfFiltro] = useState('');
  const [order, setOrder] = useState('desc');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = [...data];
    if (q) arr = arr.filter(p => p.nome.toLowerCase().includes(q));
    if (partidoFiltro) arr = arr.filter(p => p.partido === partidoFiltro);
    if (ufFiltro) arr = arr.filter(p => p.uf === ufFiltro);
    arr.sort((a, b) => order === 'desc' ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]);
    return arr;
  }, [data, query, partidoFiltro, ufFiltro, order, sortKey]);

  const partidos = useMemo(() => [...new Set(data.map(p => p.partido))].sort(), [data]);
  const ufs = useMemo(() => [...new Set(data.map(p => p.uf))].sort(), [data]);

  const fmt = valueFormatter || ((item) => {
    const v = item[sortKey];
    if (sortKey === 'cota') return fmtMoney(v);
    if (sortKey === 'frugalidade' || sortKey === 'score' || sortKey === 'presenca') return `${v}`;
    return v;
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 md:p-8"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 25, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-6xl h-[88vh] bg-[#0a0c14] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <h2 className="text-xl font-semibold text-white">{title}</h2>
                {subtitle && <p className="text-xs text-white/50 mt-0.5">{subtitle}</p>}
              </div>
              <button
                onClick={onClose}
                className="text-white/60 hover:text-white text-2xl leading-none px-2"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-white/5 bg-white/[0.02]">
              <input
                type="text"
                placeholder="Buscar parlamentar…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1 min-w-[180px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-cyan-400/40"
              />
              <select
                value={partidoFiltro}
                onChange={(e) => setPartidoFiltro(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Todos partidos</option>
                {partidos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <select
                value={ufFiltro}
                onChange={(e) => setUfFiltro(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Todas UF</option>
                {ufs.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button
                onClick={() => setOrder(o => o === 'desc' ? 'asc' : 'desc')}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white hover:bg-white/10"
              >
                {order === 'desc' ? '↓' : '↑'} {valueLabel}
              </button>
              <span className="text-xs text-white/50 ml-auto">{filtered.length} de {data.length}</span>
            </div>

            {/* Tabela ranking */}
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#0a0c14] border-b border-white/5">
                  <tr className="text-left text-white/50 text-xs uppercase tracking-wider">
                    <th className="px-6 py-3 w-12">#</th>
                    <th className="px-6 py-3">Parlamentar</th>
                    <th className="px-6 py-3 w-20">Partido</th>
                    <th className="px-6 py-3 w-16">UF</th>
                    <th className="px-6 py-3 text-right">{valueLabel}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <tr
                      key={p.id}
                      className="border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors cursor-pointer"
                    >
                      <td className="px-6 py-3 text-white/40 tabular-nums">{i + 1}</td>
                      <td className="px-6 py-3 text-white">{p.nome}</td>
                      <td className="px-6 py-3">
                        <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[11px] text-white/70">
                          {p.partido}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-white/60">{p.uf}</td>
                      <td className="px-6 py-3 text-right text-white tabular-nums">{fmt(p)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-white/40">Nenhum resultado</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
