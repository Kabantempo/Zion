import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/messages/keys?profileId=
export async function GET(req: NextRequest) {
  const profileId = new URL(req.url).searchParams.get('profileId')
  if (!profileId) return NextResponse.json({ error: 'Missing profileId' }, { status: 400 })

  const { data } = await admin.from('profile_keys').select('public_key_jwk').eq('profile_id', profileId).single()
  return NextResponse.json(data ?? null)
}

// POST /api/messages/keys — upsert own public key
export async function POST(req: NextRequest) {
  const { profileId, publicKeyJwk } = await req.json()
  if (!profileId || !publicKeyJwk) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await admin.from('profile_keys').upsert({
    profile_id: profileId,
    public_key_jwk: JSON.stringify(publicKeyJwk),
    updated_at: new Date().toISOString(),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
