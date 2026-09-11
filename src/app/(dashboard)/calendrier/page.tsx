import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { CalendarEvent, Profile } from '@/types'
import { CalendarClient } from './calendar-client'

export default async function CalendrierPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/onboarding')

  const householdId = membership.household_id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).toISOString()

  const [{ data: events }, { data: members }] = await Promise.all([
    supabase.from('events')
      .select('*, creator:profiles!created_by(display_name, color)')
      .eq('household_id', householdId)
      .gte('start', startOfMonth)
      .lte('start', endOfMonth)
      .order('start'),
    supabase.from('household_members')
      .select('user_id, profile:profiles(id, display_name, color)')
      .eq('household_id', householdId),
  ])

  const profiles = (members ?? []).map((m) => Array.isArray(m.profile) ? m.profile[0] : m.profile).filter(Boolean) as Profile[]

  return (
    <CalendarClient
      events={(events ?? []) as CalendarEvent[]}
      profiles={profiles}
      householdId={householdId}
      userId={user.id}
    />
  )
}
