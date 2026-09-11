'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { setProfileSession, getProfileSession } from '@/lib/profile-session'
import type { Profile, HouseholdMember } from '@/types'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#ef4444', '#f97316', '#5F27CD']

interface Props {
  profile: Profile
  household: { id: string; name: string; invite_code: string } | null
  members: HouseholdMember[]
  profileId: string
  isAdmin: boolean
}

export function ProfilClient({ profile, household, members, profileId, isAdmin }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [color, setColor] = useState(profile.color)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    let avatarUrl = profile.avatar_url ?? null

    if (avatarFile) {
      const session = getProfileSession()
      const ext = avatarFile.name.split('.').pop()
      const path = `avatars/${session?.profileId ?? profileId}.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true })
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatarUrl = urlData.publicUrl
      }
    }

    await supabase.from('profiles').update({ display_name: displayName.trim(), color, avatar_url: avatarUrl }).eq('id', profileId)

    // Update localStorage session
    const s = getProfileSession()
    if (s) setProfileSession({ ...s, displayName: displayName.trim(), color, avatarUrl })

    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.refresh() }, 1500)
  }

  async function logout() {
    localStorage.removeItem('zion_profile_session')
    await supabase.auth.signOut()
    router.push('/profiles')
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Profile edit */}
      <form onSubmit={saveProfile}>
        <Card>
          {/* Avatar with upload */}
          <div className="flex justify-center mb-5">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative group">
              <div
                className="w-24 h-24 rounded-3xl overflow-hidden flex items-center justify-center text-2xl font-black text-white shadow-xl transition-opacity group-hover:opacity-80"
                style={{ backgroundColor: avatarPreview ? 'transparent' : color }}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : displayName.slice(0, 2).toUpperCase()
                }
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm border-2 border-[#09090d] shadow-md">
                📷
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <Input label="Prénom / Pseudo" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <div>
              <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-2.5">Couleur</p>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-9 h-9 rounded-full transition-all duration-200 ${color === c ? 'scale-125 ring-2 ring-white/80 ring-offset-2 ring-offset-[#09090d]' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <Button type="submit" loading={loading}>
              {saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
            </Button>
          </div>
        </Card>
      </form>

      {/* Household info */}
      {household && (
        <Card>
          <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Ma colocation</h3>
          <p className="text-lg font-bold text-[#f0f0f8] mb-4">{household.name}</p>
          <h4 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-2">Membres ({members.length})</h4>
          <div className="flex flex-col gap-2">
            {members.map((m) => {
              const p = m.profile as Profile | undefined
              if (!p) return null
              return (
                <div key={m.profile_id} className="flex items-center gap-3">
                  <Avatar name={p.display_name} color={p.color} avatarUrl={p.avatar_url} size="sm" />
                  <span className="text-sm text-[#f0f0f8] flex-1">{p.display_name}</span>
                  {m.role === 'admin' && <Badge variant="info">Admin</Badge>}
                  {m.profile_id === profileId && <Badge variant="default">Moi</Badge>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Logout */}
      <Card>
        <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Compte</h3>
        <Button variant="danger" className="w-full" onClick={logout}>
          Déconnexion
        </Button>
      </Card>
    </div>
  )
}
