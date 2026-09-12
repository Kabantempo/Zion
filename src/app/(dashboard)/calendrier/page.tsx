'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import type { CalendarEvent, Profile } from '@/types'
import { CalendarClient } from './calendar-client'

export default function CalendrierPage() {
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
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 3, 0).toISOString()

    const [{ data: regularEvents }, { data: birthdays }, { data: members }] = await Promise.all([
      supabase.from('events')
        .select('*, creator:profiles!created_by(display_name, color)')
        .eq('household_id', householdId)
        .neq('type', 'birthday')
        .gte('start', startOfMonth)
        .lte('start', endOfMonth)
        .order('start'),
      supabase.from('events')
        .select('*, creator:profiles!created_by(display_name, color)')
        .eq('household_id', householdId)
        .eq('type', 'birthday'),
      supabase.from('household_members')
        .select('profile_id, profile:profiles(id, display_name, color)')
        .eq('household_id', householdId),
    ])
    const events = [...(regularEvents ?? []), ...(birthdays ?? [])]

    const profiles = (members ?? []).map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile).filter(Boolean) as Profile[]
    setData({ events: events ?? [], profiles, householdId, profileId })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <CalendarClient
      events={data.events as CalendarEvent[]}
      profiles={data.profiles}
      householdId={data.householdId}
      profileId={data.profileId}
    />
  )
}
