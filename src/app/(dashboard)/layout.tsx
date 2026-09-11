import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BottomNav } from '@/components/layout/bottom-nav'
import { TopBar } from '@/components/layout/top-bar'
import type { Profile } from '@/types'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Check if user has a household
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()

  if (!profile || !membership) {
    redirect('/onboarding')
  }

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar profile={profile as Profile} />
      <main className="flex-1 pb-24 max-w-lg mx-auto w-full">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
