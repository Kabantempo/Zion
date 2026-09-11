'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { generateInviteCode, getDefaultColor } from '@/lib/utils'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD']
const STEP_LABELS = ['Profil', 'Colocation']

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Profile
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState(COLORS[0])

  // Household
  const [mode, setMode] = useState<'create' | 'join'>('create')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  async function handleProfileStep(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim()) return
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      display_name: displayName.trim(),
      color,
      avatar_url: null,
    })

    if (error) setError(error.message)
    else setStep(1)
    setLoading(false)
  }

  async function handleHouseholdStep(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    if (mode === 'create') {
      if (!householdName.trim()) { setError('Donne un nom à ta coloc.'); setLoading(false); return }

      const { data: household, error: hErr } = await supabase
        .from('households')
        .insert({ name: householdName.trim(), invite_code: generateInviteCode(), created_by: user.id })
        .select()
        .single()

      if (hErr || !household) { setError(hErr?.message ?? 'Erreur'); setLoading(false); return }

      const { error: mErr } = await supabase.from('household_members').insert({
        household_id: household.id,
        user_id: user.id,
        role: 'admin',
      })

      if (mErr) { setError(mErr.message); setLoading(false); return }

      // Seed default task types
      await supabase.from('task_types').insert([
        { household_id: household.id, label: 'Ranger le lave-vaisselle', category: 'Cuisine', points: 10, frequency: 'daily' },
        { household_id: household.id, label: 'Faire la vaisselle', category: 'Cuisine', points: 15, frequency: 'daily' },
        { household_id: household.id, label: 'Passer le balai', category: 'Sol', points: 20, frequency: 'weekly' },
        { household_id: household.id, label: 'Passer la serpillière', category: 'Sol', points: 25, frequency: 'weekly' },
        { household_id: household.id, label: 'Sortir les poubelles', category: 'Poubelles', points: 15, frequency: 'weekly' },
        { household_id: household.id, label: 'Nettoyer la SdB', category: 'Salle de bain', points: 30, frequency: 'weekly' },
        { household_id: household.id, label: 'Nettoyer les toilettes', category: 'Salle de bain', points: 20, frequency: 'weekly' },
        { household_id: household.id, label: 'Faire les courses', category: 'Courses', points: 25, frequency: 'weekly' },
      ])

      router.push('/')
    } else {
      const code = inviteCode.trim().toUpperCase()
      const { data: household, error: hErr } = await supabase
        .from('households')
        .select()
        .eq('invite_code', code)
        .single()

      if (hErr || !household) { setError('Code invalide ou coloc introuvable.'); setLoading(false); return }

      const { error: mErr } = await supabase.from('household_members').upsert({
        household_id: household.id,
        user_id: user.id,
        role: 'member',
      })

      if (mErr) { setError(mErr.message); setLoading(false); return }

      router.push('/')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-[#0f0f13]">
      <div className="w-full max-w-sm animate-slide-up">
        {/* Steps indicator */}
        <div className="flex gap-2 mb-8 justify-center">
          {STEP_LABELS.map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${i <= step ? 'bg-red-500 text-white' : 'bg-[#2e2e3e] text-[#555570]'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              {i < STEP_LABELS.length - 1 && <div className={`w-8 h-0.5 ${i < step ? 'bg-red-500' : 'bg-[#2e2e3e]'}`} />}
            </div>
          ))}
        </div>

        {step === 0 && (
          <form onSubmit={handleProfileStep} className="flex flex-col gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[#f0f0f5]">Ton profil</h2>
              <p className="text-[#8888a0] text-sm mt-1">Dis-nous comment t'appeler</p>
            </div>

            {/* Color preview avatar */}
            <div className="flex justify-center">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-black text-white transition-colors"
                style={{ backgroundColor: color }}
              >
                {displayName ? displayName.slice(0, 2).toUpperCase() : '?'}
              </div>
            </div>

            <Input
              label="Prénom ou pseudo"
              placeholder="SuperColo"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />

            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2">Ta couleur</p>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full transition-transform ${color === c ? 'scale-110 ring-2 ring-white ring-offset-2 ring-offset-[#0f0f13]' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Continuer →
            </Button>
          </form>
        )}

        {step === 1 && (
          <form onSubmit={handleHouseholdStep} className="flex flex-col gap-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[#f0f0f5]">Ta colocation</h2>
              <p className="text-[#8888a0] text-sm mt-1">Crée ou rejoins une coloc</p>
            </div>

            <div className="flex p-1 bg-[#1a1a24] rounded-xl border border-[#2e2e3e]">
              {(['create', 'join'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${mode === m ? 'bg-red-500 text-white' : 'text-[#8888a0]'}`}
                >
                  {m === 'create' ? '🏠 Créer' : '🔑 Rejoindre'}
                </button>
              ))}
            </div>

            {mode === 'create' ? (
              <Input
                label="Nom de la colocation"
                placeholder="Les Kings du 3ème"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
              />
            ) : (
              <Input
                label="Code d'invitation"
                placeholder="ABC123"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                required
              />
            )}

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <div className="flex gap-3">
              <Button type="button" variant="secondary" onClick={() => setStep(0)} className="flex-1">
                ← Retour
              </Button>
              <Button type="submit" loading={loading} className="flex-1">
                {mode === 'create' ? 'Créer' : 'Rejoindre'} 🎉
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
