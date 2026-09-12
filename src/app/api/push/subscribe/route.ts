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
  const payload = JSON.stringify({ subscription, profileId, householdId })
  const blob = new Blob([payload], { type: 'application/json' })
  const { error } = await adminSupabase.storage.from('push').upload(
    `${householdId}/${profileId}.json`,
    blob,
    { upsert: true, contentType: 'application/json' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { profileId, householdId } = await req.json()
  await adminSupabase.storage.from('push').remove([`${householdId}/${profileId}.json`])
  return NextResponse.json({ ok: true })
}
