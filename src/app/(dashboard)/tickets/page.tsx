'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import type { Ticket, Profile } from '@/types'
import { TicketsClient } from './tickets-client'

export default function TicketsPage() {
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
    const [{ data: tickets }, { data: members }, { data: taskTypes }, { data: myProfile }] = await Promise.all([
      supabase.from('tickets')
        .select('*, assignee:profiles!assigned_to(id, display_name, color, avatar_url), creator:profiles!created_by(display_name)')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false }),
      supabase.from('household_members')
        .select('profile_id, profile:profiles(id, display_name, color, avatar_url)')
        .eq('household_id', householdId),
      supabase.from('task_types').select('id, label').eq('household_id', householdId),
      supabase.from('profiles').select('display_name').eq('id', profileId).single(),
    ])

    const profiles = (members ?? []).map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile).filter(Boolean) as Profile[]
    const displayName = (myProfile as any)?.display_name ?? 'Quelqu\'un'
    setData({ tickets: tickets ?? [], profiles, taskTypes: taskTypes ?? [], householdId, profileId, displayName })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <TicketsClient
      tickets={data.tickets as Ticket[]}
      profiles={data.profiles}
      taskTypes={data.taskTypes}
      householdId={data.householdId}
      profileId={data.profileId}
      displayName={data.displayName}
    />
  )
}
