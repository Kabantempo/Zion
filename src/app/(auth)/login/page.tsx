'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [magicSent, setMagicSent] = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push('/')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else router.push('/onboarding')
    }
    setLoading(false)
  }

  async function handleMagicLink() {
    if (!email) { setError('Entrez votre email.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } })
    if (error) setError(error.message)
    else setMagicSent(true)
    setLoading(false)
  }

  if (magicSent) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-[#0f0f13]">
        <div className="text-center animate-fade-in">
          <div className="text-5xl mb-4">✉️</div>
          <h2 className="text-xl font-bold text-[#f0f0f5] mb-2">Vérifie ta boîte mail !</h2>
          <p className="text-[#8888a0] text-sm">On t'a envoyé un lien magique à <strong className="text-[#f0f0f5]">{email}</strong></p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-[#0f0f13]">
      <div className="w-full max-w-sm animate-slide-up">
        <div className="text-center mb-8">
          <div className="text-6xl mb-3">🏠</div>
          <h1 className="text-3xl font-black text-[#f0f0f5]">Zion</h1>
          <p className="text-[#8888a0] text-sm mt-1">La coloc qui roule</p>
        </div>

        <div className="flex p-1 bg-[#1a1a24] rounded-xl mb-6 border border-[#2e2e3e]">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === m ? 'bg-indigo-500 text-white' : 'text-[#8888a0]'}`}
            >
              {m === 'login' ? 'Connexion' : 'Inscription'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Email"
            type="email"
            placeholder="toi@coloc.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Mot de passe"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
            {mode === 'login' ? 'Se connecter' : "S'inscrire"}
          </Button>
        </form>

        <div className="flex items-center gap-3 my-4">
          <div className="flex-1 h-px bg-[#2e2e3e]" />
          <span className="text-xs text-[#555570]">ou</span>
          <div className="flex-1 h-px bg-[#2e2e3e]" />
        </div>

        <Button variant="secondary" size="lg" className="w-full" onClick={handleMagicLink} loading={loading}>
          🔗 Lien magique par email
        </Button>
      </div>
    </div>
  )
}
