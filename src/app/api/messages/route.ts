import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/messages?from=&to=
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  if (!from || !to) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

  const { data, error } = await admin.from('messages')
    .select('id, from_profile_id, encrypted_content, created_at')
    .or(`and(from_profile_id.eq.${from},to_profile_id.eq.${to}),and(from_profile_id.eq.${to},to_profile_id.eq.${from})`)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/messages
export async function POST(req: NextRequest) {
  const { householdId, fromProfileId, toProfileId, encryptedContent } = await req.json()
  if (!householdId || !fromProfileId || !toProfileId || !encryptedContent) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data, error } = await admin.from('messages').insert({
    household_id: householdId,
    from_profile_id: fromProfileId,
    to_profile_id: toProfileId,
    encrypted_content: encryptedContent,
  }).select('id, from_profile_id, encrypted_content, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
