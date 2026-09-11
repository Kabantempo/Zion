'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setProfileSession, getProfileSession } from '@/lib/profile-session'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD', '#ef4444', '#f97316']
const DEFAULT_TASKS = [
  { label: 'Ranger le lave-vaisselle', category: 'Cuisine', points: 10, frequency: 'daily' },
  { label: 'Faire la vaisselle', category: 'Cuisine', points: 15, frequency: 'daily' },
  { label: 'Passer le balai', category: 'Sol', points: 20, frequency: 'weekly' },
  { label: 'Passer la serpillière', category: 'Sol', points: 25, frequency: 'weekly' },
  { label: 'Sortir les poubelles', category: 'Poubelles', points: 15, frequency: 'weekly' },
  { label: 'Nettoyer la SdB', category: 'Salle de bain', points: 30, frequency: 'weekly' },
  { label: 'Nettoyer les toilettes', category: 'Salle de bain', points: 20, frequency: 'weekly' },
  { label: 'Faire les courses', category: 'Courses', points: 25, frequency: 'weekly' },
]

type Step = 'loading' | 'netflix' | 'create-profile' | 'household'

interface HouseholdProfile {
  id: string
  display_name: string
  color: string
  avatar_url: string | null
  claimed_by: string | null
}

export default function ProfilesPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('loading')
  const [anonUserId, setAnonUserId] = useState<string | null>(null)
  const [householdProfiles, setHouseholdProfiles] = useState<HouseholdProfile[]>([])
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null)

  // Create profile form
  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)

  // Household form
  const [householdMode, setHouseholdMode] = useState<'create' | 'join'>('create')
  const [householdName, setHouseholdName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check existing profile session first
    const session = getProfileSession()
    if (session) {
      router.replace('/')
      return
    }
    initAnonymousAuth()
  }, [])

  async function initAnonymousAuth() {
    // Get or create anonymous session
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) { setStep('netflix'); return }
    setAnonUserId(user.id)

    // Check if this anon user already claimed a profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, claimed_by')
      .eq('claimed_by', user.id)
      .single()

    if (profile) {
      // Already has a profile — find their household
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('profile_id', profile.id)
        .single()

      if (membership) {
        const { data: profileData } = await supabase.from('profiles').select('*').eq('id', profile.id).single()
        if (profileData) {
          setProfileSession({
            profileId: profile.id,
            householdId: membership.household_id,
            displayName: profileData.display_name,
            color: profileData.color,
            avatarUrl: profileData.avatar_url,
          })
          router.replace('/')
          return
        }
      }
    }

    setStep('netflix')
  }

  async function selectProfile(profile: HouseholdProfile, hId: string) {
    if (!anonUserId) return
    setLoading(true)

    // Claim this profile (link to current anon user)
    await supabase.from('profiles').update({ claimed_by: anonUserId }).eq('id', profile.id)

    setProfileSession({
      profileId: profile.id,
      householdId: hId,
      displayName: profile.display_name,
      color: profile.color,
      avatarUrl: profile.avatar_url,
    })

    router.replace('/')
  }

  async function loadHouseholdProfiles(code: string) {
    const { data: household } = await supabase
      .from('households')
      .select('id')
      .eq('invite_code', code.toUpperCase())
      .single()

    if (!household) return null

    const { data: members } = await supabase
      .from('household_members')
      .select('profile:profiles(id, display_name, color, avatar_url, claimed_by)')
      .eq('household_id', household.id)

    const profiles = (members ?? []).map((m) => Array.isArray(m.profile) ? m.profile[0] : m.profile).filter(Boolean) as HouseholdProfile[]
    return { householdId: household.id, profiles }
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim() || !anonUserId) return
    setLoading(true)
    setError('')

    let avatar_url: string | null = null

    if (avatarFile) {
      const ext = avatarFile.name.split('.').pop()
      const path = `avatars/${anonUserId}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatar_url = urlData.publicUrl
      }
    }

    const { data: profile, error: pErr } = await supabase
      .from('profiles')
      .insert({ display_name: displayName.trim(), color, avatar_url, claimed_by: anonUserId })
      .select()
      .single()

    if (pErr || !profile) { setError(pErr?.message ?? 'Erreur'); setLoading(false); return }

    setCreatedProfileId(profile.id)
    setLoading(false)
    setStep('household')
  }

  async function handleHousehold(e: React.FormEvent) {
    e.preventDefault()
    if (!createdProfileId) return
    setLoading(true)
    setError('')

    if (householdMode === 'create') {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()
      const { data: household, error: hErr } = await supabase
        .from('households')
        .insert({ name: householdName.trim(), invite_code: code, created_by: createdProfileId })
        .select()
        .single()

      if (hErr || !household) { setError(hErr?.message ?? 'Erreur'); setLoading(false); return }

      await supabase.from('household_members').insert({ household_id: household.id, profile_id: createdProfileId, role: 'admin' })
      await supabase.from('task_types').insert(DEFAULT_TASKS.map((t) => ({ ...t, household_id: household.id })))

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', createdProfileId).single()
      setProfileSession({ profileId: createdProfileId, householdId: household.id, displayName: profile!.display_name, color: profile!.color, avatarUrl: profile!.avatar_url })
      router.replace('/')
    } else {
      const result = await loadHouseholdProfiles(inviteCode)
      if (!result) { setError('Code invalide.'); setLoading(false); return }

      await supabase.from('household_members').upsert({ household_id: result.householdId, profile_id: createdProfileId, role: 'member' })

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', createdProfileId).single()
      setProfileSession({ profileId: createdProfileId, householdId: result.householdId, displayName: profile!.display_name, color: profile!.color, avatarUrl: profile!.avatar_url })
      router.replace('/')
    }
    setLoading(false)
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (step === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#0f0f13]">
        <div className="w-10 h-10 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ─── CREATE PROFILE ────────────────────────────────────────────────────────
  if (step === 'create-profile') {
    return (
      <div className="min-h-dvh bg-[#0f0f13] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <h1 className="text-2xl font-black text-[#f0f0f5] text-center mb-2">Crée ton profil</h1>
          <p className="text-[#8888a0] text-sm text-center mb-8">Ton nom, ta couleur, ta photo.</p>

          <form onSubmit={handleCreateProfile} className="flex flex-col gap-6">
            {/* Avatar picker */}
            <div className="flex justify-center">
              <label className="cursor-pointer group relative">
                <div
                  className="w-28 h-28 rounded-full flex items-center justify-center text-4xl font-black text-white transition-all group-hover:opacity-80 overflow-hidden"
                  style={{ backgroundColor: avatarPreview ? 'transparent' : color }}
                >
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    : (displayName ? displayName.slice(0, 2).toUpperCase() : '?')
                  }
                </div>
                <div className="absolute bottom-0 right-0 w-9 h-9 bg-red-500 rounded-full flex items-center justify-center text-white text-lg shadow-lg">📷</div>
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>

            {/* Name */}
            <div>
              <input
                className="w-full px-4 py-3 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] placeholder:text-[#555570] outline-none focus:border-red-500 text-center text-xl font-bold"
                placeholder="Ton prénom"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            {/* Color */}
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2 text-center">Ta couleur</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-10 h-10 rounded-full transition-all ${color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#0f0f13]' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full py-4 bg-red-500 hover:bg-red-400 text-white font-bold text-lg rounded-2xl transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Continuer →'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── HOUSEHOLD ─────────────────────────────────────────────────────────────
  if (step === 'household') {
    return (
      <div className="min-h-dvh bg-[#0f0f13] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <h1 className="text-2xl font-black text-[#f0f0f5] text-center mb-2">Ta colocation</h1>
          <p className="text-[#8888a0] text-sm text-center mb-8">Crée ou rejoins une coloc</p>

          <form onSubmit={handleHousehold} className="flex flex-col gap-6">
            <div className="flex p-1 bg-[#1a1a24] rounded-2xl border border-[#2e2e3e]">
              {(['create', 'join'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setHouseholdMode(m)}
                  className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all ${householdMode === m ? 'bg-red-500 text-white' : 'text-[#8888a0]'}`}
                >
                  {m === 'create' ? '🏠 Créer' : '🔑 Rejoindre'}
                </button>
              ))}
            </div>

            {householdMode === 'create' ? (
              <input
                className="w-full px-4 py-3 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] placeholder:text-[#555570] outline-none focus:border-red-500 text-center text-lg font-bold"
                placeholder="Nom de la coloc"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                required
              />
            ) : (
              <input
                className="w-full px-4 py-3 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] placeholder:text-[#555570] outline-none focus:border-red-500 text-center text-2xl font-black tracking-widest uppercase"
                placeholder="CODE"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                maxLength={6}
                required
              />
            )}

            {error && <p className="text-sm text-red-400 text-center">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-red-500 hover:bg-red-400 text-white font-bold text-lg rounded-2xl transition-all active:scale-95 disabled:opacity-50"
            >
              {loading ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (householdMode === 'create' ? 'Créer 🎉' : 'Rejoindre →')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── NETFLIX PROFILE SCREEN ────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[#0a0a0a] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg animate-fade-in">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black text-[#f0f0f5] mb-2">Zion</h1>
          <p className="text-[#8888a0]">Qui est là ?</p>
        </div>

        {householdProfiles.length > 0 && householdId ? (
          <>
            <div className="grid grid-cols-3 gap-6 mb-10">
              {householdProfiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => selectProfile(profile, householdId)}
                  disabled={loading}
                  className="flex flex-col items-center gap-3 group"
                >
                  <div
                    className="w-20 h-20 rounded-xl overflow-hidden flex items-center justify-center text-2xl font-black text-white transition-all group-hover:ring-4 group-hover:ring-white group-active:scale-95"
                    style={{ backgroundColor: profile.color }}
                  >
                    {profile.avatar_url
                      ? <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                      : profile.display_name.slice(0, 2).toUpperCase()
                    }
                  </div>
                  <span className="text-sm font-medium text-[#8888a0] group-hover:text-[#f0f0f5] transition-colors">{profile.display_name}</span>
                </button>
              ))}

              {/* Add new profile */}
              <button
                onClick={() => setStep('create-profile')}
                className="flex flex-col items-center gap-3 group"
              >
                <div className="w-20 h-20 rounded-xl border-2 border-dashed border-[#2e2e3e] flex items-center justify-center text-3xl text-[#555570] group-hover:border-[#8888a0] group-hover:text-[#8888a0] transition-all">
                  +
                </div>
                <span className="text-sm font-medium text-[#555570] group-hover:text-[#8888a0] transition-colors">Ajouter</span>
              </button>
            </div>

            <div className="text-center">
              <p className="text-xs text-[#555570]">Tu n'es pas dans cette coloc ?</p>
              <button
                onClick={() => setHouseholdProfiles([])}
                className="text-xs text-[#8888a0] underline mt-1"
              >
                Entrer un autre code
              </button>
            </div>
          </>
        ) : (
          /* No household loaded yet — enter invite code */
          <div className="flex flex-col items-center gap-6">
            <div className="w-full flex flex-col gap-3">
              <p className="text-sm text-[#8888a0] text-center">Entre ton code d'invitation</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 px-4 py-3 rounded-xl bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] placeholder:text-[#555570] outline-none focus:border-red-500 text-center text-xl font-black tracking-widest uppercase"
                  placeholder="ABC123"
                  maxLength={6}
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                />
                <button
                  onClick={async () => {
                    if (inviteCode.length < 6) return
                    setLoading(true)
                    const result = await loadHouseholdProfiles(inviteCode)
                    if (result) {
                      setHouseholdProfiles(result.profiles)
                      setHouseholdId(result.householdId)
                    } else {
                      setError('Code invalide')
                    }
                    setLoading(false)
                  }}
                  disabled={loading || inviteCode.length < 6}
                  className="px-5 py-3 bg-[#1a1a24] border border-[#2e2e3e] text-[#f0f0f5] rounded-xl font-bold hover:border-red-500 transition-all disabled:opacity-50 active:scale-95"
                >
                  →
                </button>
              </div>
              {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
