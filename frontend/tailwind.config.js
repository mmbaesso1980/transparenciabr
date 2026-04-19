/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'bento-bg': '#FAFAFA',
        'asmodeus-dark': '#0f172a',
        'asmodeus-red': '#ef4444',
      },
      fontFamily: {
        cabinet: ['Cabinet Grotesk', 'sans-serif'],
        satoshi: ['Satoshi', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
