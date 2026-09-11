import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Profile, HouseholdMember } from '@/types'
import { ProfilClient } from './profil-client'

export default async function ProfilPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/onboarding')

  const householdId = membership.household_id

  const [{ data: profile }, { data: household }, { data: members }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('households').select('*').eq('id', householdId).single(),
    supabase.from('household_members')
      .select('user_id, role, joined_at, profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId),
  ])

  const normalizedMembers = (members ?? []).map((m) => ({
    ...m,
    household_id: householdId,
    profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
  })) as HouseholdMember[]

  return (
    <ProfilClient
      profile={profile as Profile}
      household={household}
      members={normalizedMembers}
      userId={user.id}
      isAdmin={membership.role === 'admin'}
    />
  )
}
