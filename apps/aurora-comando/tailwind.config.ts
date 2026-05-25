import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#01696F', dark: '#0C4E54' },
        ink: '#1A1A1A',
        bg: '#F7F6F2',
        critica: '#7A1B4A',
        alta: '#A12C7B',
        media: '#964219',
        info: '#5A5A5A'
      },
      fontFamily: {
        display: ['"DM Sans"', 'sans-serif'],
        body: ['Inter', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config
