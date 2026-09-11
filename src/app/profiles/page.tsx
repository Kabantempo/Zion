'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { setProfileSession, getProfileSession } from '@/lib/profile-session'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#ef4444', '#f97316', '#5F27CD']
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

type Step = 'loading' | 'netflix' | 'create-profile'

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
  const [profiles, setProfiles] = useState<HouseholdProfile[]>([])
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null)

  const [displayName, setDisplayName] = useState('')
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * COLORS.length)])
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const session = getProfileSession()
    if (session) { router.replace('/accueil'); return }
    init()
  }, [])

  async function init() {
    let { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      const { data } = await supabase.auth.signInAnonymously()
      user = data.user
    }
    if (!user) { setStep('netflix'); return }
    setAnonUserId(user.id)

    // If this device already claimed a profile, restore session
    const { data: claimedProfile } = await supabase
      .from('profiles').select('id, claimed_by').eq('claimed_by', user.id).single()

    if (claimedProfile) {
      const [{ data: membership }, { data: pd }] = await Promise.all([
        supabase.from('household_members').select('household_id').eq('profile_id', claimedProfile.id).single(),
        supabase.from('profiles').select('*').eq('id', claimedProfile.id).single(),
      ])
      if (membership && pd) {
        setProfileSession({ profileId: pd.id, householdId: membership.household_id, displayName: pd.display_name, color: pd.color, avatarUrl: pd.avatar_url })
        router.replace('/accueil')
        return
      }
      // Profile exists but no household yet — skip profile creation step
      if (pd) setCreatedProfileId(pd.id)
    }

    // Load (or create) the household and its profiles
    await loadHousehold()
    setStep('netflix')
  }

  async function loadHousehold() {
    // Get the first (and only) household, or create one
    let { data: households } = await supabase.from('households').select('id').limit(1)

    let hId: string | null = households && households.length > 0 ? households[0].id : null
    if (!hId) {
      // Will be created after the first profile is created
      setHouseholdId(null)
      setProfiles([])
      return
    }

    setHouseholdId(hId)

    const { data: members } = await supabase
      .from('household_members')
      .select('profile:profiles(id, display_name, color, avatar_url, claimed_by)')
      .eq('household_id', hId)

    const ps = (members ?? []).map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile).filter(Boolean) as HouseholdProfile[]
    setProfiles(ps)
  }

  async function selectProfile(profile: HouseholdProfile) {
    if (!anonUserId || !householdId) return
    setLoading(true)
    await supabase.from('profiles').update({ claimed_by: anonUserId }).eq('id', profile.id)
    setProfileSession({ profileId: profile.id, householdId, displayName: profile.display_name, color: profile.color, avatarUrl: profile.avatar_url })
    router.replace('/accueil')
  }

  async function handleCreateProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!displayName.trim() || !anonUserId) return
    setLoading(true)
    setError('')

    let profileId = createdProfileId
    let profileData: any = null

    if (!profileId) {
      // Upload avatar if any
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

      const { data: created, error: pErr } = await supabase
        .from('profiles')
        .insert({ display_name: displayName.trim(), color, avatar_url, claimed_by: anonUserId })
        .select().single()

      if (pErr || !created) { setError(pErr?.message ?? 'Erreur'); setLoading(false); return }
      profileId = created.id
      profileData = created
    } else {
      const { data: existing } = await supabase.from('profiles').select('*').eq('id', profileId).single()
      profileData = existing
    }

    if (!profileData) { setError('Erreur profil'); setLoading(false); return }

    // Create household if it doesn't exist yet (first user)
    let hId = householdId
    if (!hId) {
      const { data: newHousehold } = await supabase
        .from('households')
        .insert({ name: 'Zion', invite_code: Math.random().toString(36).substring(2, 8).toUpperCase(), created_by: profileId })
        .select().single()
      if (!newHousehold) { setError('Erreur création foyer'); setLoading(false); return }
      hId = newHousehold.id
      await supabase.from('task_types').insert(DEFAULT_TASKS.map((t) => ({ ...t, household_id: hId })))
    }

    const { error: hmErr } = await supabase.from('household_members').insert({ household_id: hId, profile_id: profileId, role: householdId ? 'member' : 'admin' })
    if (hmErr && hmErr.code !== '23505') { setError('Erreur ajout membre: ' + hmErr.message); setLoading(false); return }

    setProfileSession({ profileId, householdId: hId!, displayName: profileData.display_name, color: profileData.color, avatarUrl: profileData.avatar_url ?? '' })
    router.replace('/accueil')
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
      <div className="min-h-dvh flex items-center justify-center bg-[#09090d]">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.svg" alt="Zion" width={56} height={56} className="rounded-xl" />
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // ─── CREATE PROFILE ────────────────────────────────────────────────────────
  if (step === 'create-profile') {
    return (
      <div className="min-h-dvh bg-[#09090d] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm animate-slide-up">
          <button onClick={() => setStep('netflix')} className="text-[#7070a0] text-sm mb-8 flex items-center gap-1.5 hover:text-[#f0f0f8] transition-colors">
            <span>←</span> Retour
          </button>
          <h1 className="text-3xl font-black text-[#f0f0f8] text-center mb-1 tracking-tight">Crée ton profil</h1>
          <p className="text-[#7070a0] text-sm text-center mb-10">Ton nom, ta couleur, ta photo.</p>

          <form onSubmit={handleCreateProfile} className="flex flex-col gap-5">
            <div className="flex justify-center">
              <label className="cursor-pointer group relative">
                <div
                  className="w-28 h-28 rounded-3xl flex items-center justify-center text-3xl font-black text-white transition-all group-hover:opacity-80 overflow-hidden shadow-2xl"
                  style={{ backgroundColor: avatarPreview ? 'transparent' : color }}
                >
                  {avatarPreview
                    ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                    : (displayName ? displayName.slice(0, 2).toUpperCase() : '?')
                  }
                </div>
                <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-red-500 rounded-full flex items-center justify-center text-white text-base shadow-lg border-2 border-[#09090d]">📷</div>
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>

            <input
              className="w-full px-5 py-4 rounded-2xl bg-[#13131a] border border-[#252535] text-[#f0f0f8] placeholder:text-[#44445a] outline-none focus:border-red-500/60 focus:bg-[#16161f] text-center text-xl font-bold transition-all"
              placeholder="Ton prénom"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />

            <div>
              <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3 text-center">Ta couleur</p>
              <div className="flex gap-2.5 flex-wrap justify-center">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full transition-all duration-200 ${color === c ? 'scale-125 ring-2 ring-white/80 ring-offset-2 ring-offset-[#09090d] shadow-lg' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-400 text-center bg-red-500/10 py-2 px-4 rounded-xl">{error}</p>}

            <button
              type="submit"
              disabled={loading || !displayName.trim()}
              className="w-full py-4 bg-red-500 hover:bg-red-400 text-white font-bold text-base rounded-2xl transition-all active:scale-[0.98] disabled:opacity-40 shadow-lg shadow-red-500/20 mt-1"
            >
              {loading ? <span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Rejoindre →'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ─── NETFLIX SCREEN ────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[#09090d] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-14">
          <div className="flex justify-center mb-4">
            <img src="/logo.svg" alt="Zion" width={72} height={72} className="rounded-2xl shadow-xl shadow-black/60" />
          </div>
          <h1 className="text-5xl font-black text-[#f0f0f8] mb-3 tracking-tight">Zion</h1>
          <p className="text-[#7070a0] text-sm font-medium tracking-wide uppercase">Qui est là ?</p>
        </div>

        <div className="grid grid-cols-3 gap-5 mb-10">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              onClick={() => selectProfile(profile)}
              disabled={loading}
              className="flex flex-col items-center gap-2.5 group"
            >
              <div
                className="w-20 h-20 rounded-2xl overflow-hidden flex items-center justify-center text-2xl font-black text-white transition-all duration-200 group-hover:scale-105 group-hover:shadow-2xl group-active:scale-95 shadow-lg"
                style={{ backgroundColor: profile.color, boxShadow: `0 8px 24px ${profile.color}40` }}
              >
                {profile.avatar_url
                  ? <img src={profile.avatar_url} alt={profile.display_name} className="w-full h-full object-cover" />
                  : profile.display_name.slice(0, 2).toUpperCase()
                }
              </div>
              <span className="text-xs font-semibold text-[#7070a0] group-hover:text-[#f0f0f8] transition-colors">{profile.display_name}</span>
            </button>
          ))}

          <button
            onClick={() => setStep('create-profile')}
            className="flex flex-col items-center gap-2.5 group"
          >
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-[#252535] flex items-center justify-center text-2xl text-[#44445a] group-hover:border-red-500/40 group-hover:text-red-400 group-hover:bg-red-500/5 transition-all duration-200">
              +
            </div>
            <span className="text-xs font-semibold text-[#44445a] group-hover:text-[#7070a0] transition-colors">Ajouter</span>
          </button>
        </div>
      </div>
    </div>
  )
}
