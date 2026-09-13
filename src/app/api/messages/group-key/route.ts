import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/messages/group-key?householdId=&profileId=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const householdId = searchParams.get('householdId')
  const profileId = searchParams.get('profileId')
  if (!householdId || !profileId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const { data } = await admin.from('group_keys')
    .select('wrapped_key, created_by')
    .eq('household_id', householdId)
    .eq('profile_id', profileId)
    .single()

  return NextResponse.json(data ?? null)
}

// POST /api/messages/group-key — store wrapped keys for all members
export async function POST(req: NextRequest) {
  const { householdId, createdBy, wrappedKeys } = await req.json()
  // wrappedKeys: Array<{ profileId: string; wrappedKey: string }>
  if (!householdId || !createdBy || !wrappedKeys?.length) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const rows = wrappedKeys.map((wk: { profileId: string; wrappedKey: string }) => ({
    household_id: householdId,
    profile_id: wk.profileId,
    wrapped_key: wk.wrappedKey,
    created_by: createdBy,
  }))

  const { error } = await admin.from('group_keys').upsert(rows, { onConflict: 'household_id,profile_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
