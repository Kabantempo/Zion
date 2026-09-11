'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import type { Profile, HouseholdMember } from '@/types'
import { ProfilClient } from './profil-client'

export default function ProfilPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [])

  async function load(profileId: string, householdId: string) {
    const [{ data: profile }, { data: membership }, { data: household }, { data: members }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', profileId).single(),
      supabase.from('household_members').select('role').eq('household_id', householdId).eq('profile_id', profileId).single(),
      supabase.from('households').select('*').eq('id', householdId).single(),
      supabase.from('household_members').select('profile_id, role, joined_at, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
    ])

    const normalizedMembers = (members ?? []).map((m: any) => ({
      household_id: householdId,
      profile_id: m.profile_id,
      role: m.role,
      joined_at: m.joined_at,
      profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
    })) as HouseholdMember[]

    setData({ profile, household, members: normalizedMembers, profileId, isAdmin: membership?.role === 'admin' })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <ProfilClient
      profile={data.profile as Profile}
      household={data.household}
      members={data.members}
      profileId={data.profileId}
      isAdmin={data.isAdmin}
    />
  )
}
