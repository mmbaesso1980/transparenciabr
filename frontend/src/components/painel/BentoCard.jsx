import React from 'react';
import { motion } from 'framer-motion';

/**
 * BentoCard — wrapper visual de cada card do Painel (navegação por rota; sem modal).
 * Props:
 *  - title: string (título do card)
 *  - icon: string ou ReactNode (emoji/ícone na esquerda do título)
 *  - onClick: () => void (ex.: navigate('/ranking'))
 *  - children: conteúdo do card
 *  - accent: cor de hover ('cyan' | 'violet' | 'red' | 'green' | 'amber')
 */
const ACCENT_MAP = {
  cyan:   'hover:border-cyan-400/40 hover:shadow-[0_0_30px_-10px_rgba(34,211,238,0.4)]',
  violet: 'hover:border-violet-400/40 hover:shadow-[0_0_30px_-10px_rgba(167,139,250,0.4)]',
  red:    'hover:border-red-400/40 hover:shadow-[0_0_30px_-10px_rgba(248,113,113,0.4)]',
  green:  'hover:border-emerald-400/40 hover:shadow-[0_0_30px_-10px_rgba(52,211,153,0.4)]',
  amber:  'hover:border-amber-400/40 hover:shadow-[0_0_30px_-10px_rgba(251,191,36,0.4)]',
};

export default function BentoCard({
  title,
  icon = null,
  onClick,
  className = '',
  accent = 'cyan',
  children,
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.995 }}
      className={[
        'group text-left w-full h-full min-h-0',
        'relative overflow-hidden bg-slate-900 border border-slate-800 rounded-xl p-4',
        'flex flex-col gap-2 transition-all duration-200',
        'cursor-pointer hover:ring-1 hover:ring-slate-500',
        ACCENT_MAP[accent] || ACCENT_MAP.cyan,
        className,
      ].join(' ')}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-white/[0.03] to-transparent" />

      <div className="flex items-center gap-2 text-[13px] font-medium text-white/80 shrink-0 relative z-10 min-w-0">
        {icon && <span className="text-base leading-none shrink-0">{icon}</span>}
        <span className="tracking-wide truncate">{title}</span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative z-10">
        {children}
      </div>
    </motion.button>
  );
}
