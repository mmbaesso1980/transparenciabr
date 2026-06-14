/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'teal': {
          DEFAULT: '#01696F',
          'dark': '#0C4E54',
          'light': '#E6F1F1',
          '600': '#01696F', // Alias for default
          '700': '#0C4E54', // Alias for dark
          '800': '#0C4E54',
        },
        'ink': {
          DEFAULT: '#1A1A1A',
          'muted': '#5A5A5A',
        },
        'brand-bg': '#F7F6F2',
        'brand-border': '#D4D1CA',
        'severity': {
          'critical-dark': '#6B1A4D',
          'critical-bg': '#FFD9E6',
          'high-dark': '#A12C7B',
          'high-bg': '#FCEBD9',
          'medium-dark': '#964219',
          'medium-bg': '#FAF6E0',
          'low-dark': '#437A22',
          'low-bg': '#E6F2DD',
        }
      },
      fontFamily: {
        'sans': ['Inter', 'sans-serif'],
        'display': ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
