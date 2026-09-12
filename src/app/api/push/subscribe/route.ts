import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { subscription, profileId, householdId } = await req.json()
  if (!subscription || !profileId || !householdId) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const { error } = await adminSupabase.from('push_subscriptions').upsert({
    profile_id: profileId,
    household_id: householdId,
    subscription,
  }, { onConflict: 'profile_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { profileId } = await req.json()
  await adminSupabase.from('push_subscriptions').delete().eq('profile_id', profileId)
  return NextResponse.json({ ok: true })
}
