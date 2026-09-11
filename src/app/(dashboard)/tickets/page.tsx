import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Ticket, Profile } from '@/types'
import { TicketsClient } from './tickets-client'

export default async function TicketsPage() {
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

  const [{ data: tickets }, { data: members }, { data: taskTypes }] = await Promise.all([
    supabase.from('tickets')
      .select('*, assignee:profiles!assigned_to(id, display_name, color, avatar_url), creator:profiles!created_by(display_name)')
      .eq('household_id', householdId)
      .order('created_at', { ascending: false }),
    supabase.from('household_members')
      .select('user_id, profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId),
    supabase.from('task_types').select('id, label').eq('household_id', householdId),
  ])

  const profiles = (members ?? []).map((m) => Array.isArray(m.profile) ? m.profile[0] : m.profile).filter(Boolean) as Profile[]

  return (
    <TicketsClient
      tickets={(tickets ?? []) as Ticket[]}
      profiles={profiles}
      taskTypes={taskTypes ?? []}
      householdId={householdId}
      userId={user.id}
    />
  )
}
