/**
 * Ocean Ways — Vite Config
 *
 * TODO (Maestro):
 *   [ ] Adicionar VITE_OCEANWAYS_API_URL nas GitHub Actions secrets
 *   [ ] Configurar base URL para subpath se necessário (default: '/')
 *   [ ] Adicionar vite-plugin-pwa para PWA (opcional R2)
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // Proxy para desenvolvimento local — redireciona /api/* para o backend local
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,      // Não incluir sourcemaps em produção
    rollupOptions: {
      output: {
        // Separar vendors para melhor caching
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          firebase: ['firebase'],
        },
      },
    },
  },
})
