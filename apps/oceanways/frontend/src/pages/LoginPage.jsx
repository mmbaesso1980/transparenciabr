/**
 * Ocean Ways — Page: LoginPage
 *
 * Página de login com Firebase Auth.
 *
 * Métodos suportados:
 *   - Google (botão OAuth)
 *   - E-mail + senha (com link de cadastro)
 *
 * Fluxo:
 *   1. Usuário clica "Entrar com Google" → Firebase signInWithPopup (GoogleAuthProvider)
 *   2. Ao autenticar, backend cria/atualiza doc em Firestore users/{uid}
 *   3. Redirect para /dashboard ou para rota original (state.from)
 *
 * TODO (Maestro):
 *   [ ] Implementar signInWithGoogle usando firebase/auth
 *   [ ] Implementar e-mail/senha (signInWithEmailAndPassword)
 *   [ ] Implementar cadastro (createUserWithEmailAndPassword)
 *   [ ] Checkbox de aceite de Termos + Política de Privacidade (obrigatório LGPD)
 *   [ ] Consentimento de armazenar histórico (opt-in explícito)
 *   [ ] Redirect pós-login para state.from ou /dashboard
 *   [ ] Tratar erros (e-mail já cadastrado, senha fraca, etc.)
 */

import { Waves } from 'lucide-react'

export default function LoginPage() {
  const handleGoogleLogin = async () => {
    // TODO: importar GoogleAuthProvider, signInWithPopup
    // const provider = new GoogleAuthProvider()
    // await signInWithPopup(getAuth(), provider)
    // navigate(state?.from || '/dashboard')
    console.log('TODO: Google login')
  }

  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Waves size={28} className="text-ocean-300" aria-hidden="true" />
            <span className="text-2xl font-bold text-white">
              Ocean<span className="text-gold-400">Ways</span>
            </span>
          </div>
          <p className="text-ocean-300 text-sm">Encontre seu voo de prêmio perfeito</p>
        </div>

        {/* Card de login */}
        <div className="bg-ocean-900 border border-ocean-700 rounded-2xl p-6">
          <h1 className="text-white font-bold text-xl mb-6">Entrar</h1>

          {/* Google */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-800 font-medium py-2.5 rounded-lg transition-colors mb-4"
          >
            {/* TODO: adicionar logo Google SVG */}
            <span>Entrar com Google</span>
          </button>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-ocean-700" />
            </div>
            <div className="relative flex justify-center text-xs text-neutral-400">
              <span className="bg-ocean-900 px-2">ou com e-mail</span>
            </div>
          </div>

          {/* E-mail + senha — TODO: implementar */}
          <div className="space-y-3">
            <input
              type="email"
              placeholder="seu@email.com"
              className="w-full bg-ocean-800 border border-ocean-600 text-white rounded-lg px-3 py-2.5 text-sm placeholder-neutral-500 focus:outline-none focus:border-ocean-500"
              // TODO: conectar ao state
            />
            <input
              type="password"
              placeholder="Senha"
              className="w-full bg-ocean-800 border border-ocean-600 text-white rounded-lg px-3 py-2.5 text-sm placeholder-neutral-500 focus:outline-none focus:border-ocean-500"
              // TODO: conectar ao state
            />
            <button className="w-full bg-ocean-500 hover:bg-ocean-300 hover:text-ocean-950 text-white font-bold py-2.5 rounded-lg transition-colors">
              Entrar
              {/* TODO: conectar ao handler */}
            </button>
          </div>

          {/* Consentimento LGPD — OBRIGATÓRIO */}
          <p className="mt-4 text-neutral-400 text-xs text-center">
            Ao entrar, você concorda com os{' '}
            <a href="/termos" className="text-ocean-300 hover:underline">Termos de Uso</a>{' '}
            e a{' '}
            <a href="/privacidade" className="text-ocean-300 hover:underline">Política de Privacidade</a>.
            {/* TODO: adicionar links reais para /termos e /privacidade */}
          </p>
        </div>
      </div>
    </div>
  )
}
