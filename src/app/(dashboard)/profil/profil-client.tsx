'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import type { Profile, HouseholdMember } from '@/types'

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF', '#5F27CD']

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
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [color, setColor] = useState(profile.color)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [codeCopied, setCodeCopied] = useState(false)

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await supabase.from('profiles').update({ display_name: displayName.trim(), color }).eq('id', profileId)
    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.refresh() }, 1500)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function copyInviteCode() {
    if (household) {
      navigator.clipboard.writeText(household.invite_code)
      setCodeCopied(true)
      setTimeout(() => setCodeCopied(false), 2000)
    }
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Profile edit */}
      <form onSubmit={saveProfile}>
        <Card>
          <div className="flex justify-center mb-4">
            <Avatar name={displayName || profile.display_name} color={color} avatarUrl={profile.avatar_url} size="lg" />
          </div>
          <div className="flex flex-col gap-4">
            <Input label="Prénom / Pseudo" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2">Couleur</p>
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
            <Button type="submit" loading={loading}>
              {saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
            </Button>
          </div>
        </Card>
      </form>

      {/* Household info */}
      {household && (
        <Card>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-3">Ma colocation</h3>
          <p className="text-lg font-bold text-[#f0f0f5] mb-3">{household.name}</p>
          <h4 className="text-sm font-semibold text-[#8888a0] mb-2">Membres ({members.length})</h4>
          <div className="flex flex-col gap-2">
            {members.map((m) => {
              const p = m.profile as Profile | undefined
              if (!p) return null
              return (
                <div key={m.profile_id} className="flex items-center gap-3">
                  <Avatar name={p.display_name} color={p.color} avatarUrl={p.avatar_url} size="sm" />
                  <span className="text-sm text-[#f0f0f5] flex-1">{p.display_name}</span>
                  {m.role === 'admin' && <Badge variant="info">Admin</Badge>}
                  {m.profile_id === profileId && <Badge variant="default">Moi</Badge>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Danger zone */}
      <Card>
        <h3 className="text-sm font-semibold text-[#8888a0] mb-3">Compte</h3>
        <Button variant="danger" className="w-full" onClick={logout}>
          Déconnexion
        </Button>
      </Card>
    </div>
  )
}
