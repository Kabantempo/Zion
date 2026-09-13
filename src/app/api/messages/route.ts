import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/messages?householdId=&from=&to=   (to omitted = group)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const householdId = searchParams.get('householdId')
  const from = searchParams.get('from')
  const to = searchParams.get('to') // null for group

  if (!householdId) return NextResponse.json({ error: 'Missing householdId' }, { status: 400 })

  let query = admin.from('messages')
    .select('id, from_profile_id, to_profile_id, encrypted_content, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
    .limit(200)

  if (to && from) {
    // DM: messages between two people
    query = query.or(`and(from_profile_id.eq.${from},to_profile_id.eq.${to}),and(from_profile_id.eq.${to},to_profile_id.eq.${from})`)
  } else {
    // Group: no to_profile_id
    query = query.is('to_profile_id', null)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/messages
export async function POST(req: NextRequest) {
  const { householdId, fromProfileId, toProfileId, content } = await req.json()
  if (!householdId || !fromProfileId || !content) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data, error } = await admin.from('messages').insert({
    household_id: householdId,
    from_profile_id: fromProfileId,
    to_profile_id: toProfileId ?? null,
    encrypted_content: content,
  }).select('id, from_profile_id, to_profile_id, encrypted_content, created_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
