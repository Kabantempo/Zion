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
  const [uploadError, setUploadError] = useState<string | null>(null)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    // Resize + compress to base64 via canvas
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    img.onload = () => {
      const SIZE = 256
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const ratio = Math.min(SIZE / img.width, SIZE / img.height)
      const w = img.width * ratio; const h = img.height * ratio
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h)
      const base64 = canvas.toDataURL('image/jpeg', 0.8)
      setAvatarPreview(base64)
      URL.revokeObjectURL(objectUrl)
    }
    img.src = objectUrl
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setUploadError(null)

    const avatarUrl = avatarFile ? (avatarPreview ?? profile.avatar_url ?? null) : (profile.avatar_url ?? null)

    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim(), color, avatar_url: avatarUrl }).eq('id', profileId)

    if (error) {
      setUploadError('Erreur : ' + error.message)
      setLoading(false)
      return
    }

    const s = getProfileSession()
    if (s) setProfileSession({ ...s, displayName: displayName.trim(), color, avatarUrl })

    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.refresh() }, 1500)
  }

  async function logout() {
    localStorage.removeItem('zion_profile')
    try { await supabase.auth.signOut() } catch {}
    window.location.href = '/profiles'
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
            {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
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
