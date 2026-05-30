/**
 * Ocean Ways — Tailwind Config
 * Paleta Deep Ocean (documentada em ARCHITECTURE.md seção Visual)
 */

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta Ocean
        ocean: {
          950: '#020B18',
          900: '#051929',
          800: '#07243A',
          700: '#0A3A6B',
          600: '#0D4D8F',
          500: '#1565C0',
          400: '#1E88E5',
          300: '#42A5F5',
          200: '#90CAF9',
          100: '#BBDEFB',
          50:  '#E3F2FD',
        },
        // Accent dourado (badges premium, CTAs de upgrade)
        gold: {
          400: '#FFCA28',
          500: '#FFB300',
          600: '#F9A825',
        },
        // Neutros
        neutral: {
          600: '#546E7A',
          400: '#78909C',
          200: '#B0BEC5',
          100: '#ECEFF1',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      // TODO (Maestro): adicionar keyframes de animação (wave, fade-in)
    },
  },
  plugins: [],
}
