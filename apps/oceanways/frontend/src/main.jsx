/**
 * Ocean Ways — Entry Point React
 *
 * TODO (Maestro):
 *   [ ] Inicializar Firebase App com config do VITE_FIREBASE_* env vars
 *   [ ] Adicionar StrictMode para detectar problemas em desenvolvimento
 *   [ ] Configurar ErrorBoundary global
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/globals.css'

// TODO: inicializar Firebase
// import { initializeApp } from 'firebase/app'
// const firebaseConfig = {
//   apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
//   authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
//   projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
//   storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
//   messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
//   appId:             import.meta.env.VITE_FIREBASE_APP_ID,
// }
// initializeApp(firebaseConfig)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
