import React from 'react';
import { motion } from 'framer-motion';

/**
 * BentoCard — wrapper visual de cada card do Painel.
 * Props:
 *  - title: string (título do card)
 *  - icon: string ou ReactNode (emoji/ícone na esquerda do título)
 *  - onClick: () => void (abre modal full-screen com ranking 513)
 *  - colSpan / rowSpan: classes Tailwind extras pra grid
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
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.995 }}
      className={[
        'group relative text-left w-full h-full',
        'bg-[#0d0f1a]/80 backdrop-blur-sm',
        'border border-white/[0.06] rounded-2xl',
        'p-4 md:p-5 transition-all duration-300',
        'flex flex-col gap-3 overflow-hidden',
        'cursor-pointer',
        ACCENT_MAP[accent] || ACCENT_MAP.cyan,
        className,
      ].join(' ')}
    >
      {/* gradient highlight no hover */}
      <span className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/[0.02] to-transparent" />

      {/* header */}
      <div className="flex items-center gap-2 text-[13px] font-medium text-white/70 relative z-10">
        {icon && <span className="text-base leading-none">{icon}</span>}
        <span className="tracking-wide">{title}</span>
      </div>

      {/* body */}
      <div className="flex-1 min-h-0 relative z-10">
        {children}
      </div>
    </motion.button>
  );
}
