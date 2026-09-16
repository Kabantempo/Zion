import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const householdId = req.nextUrl.searchParams.get('householdId')
  if (!householdId) return NextResponse.json({ error: 'Missing householdId' }, { status: 400 })

  const { data } = await adminSupabase
    .from('households')
    .select('encryption_key')
    .eq('id', householdId)
    .single()

  return NextResponse.json({ key: data?.encryption_key ?? null })
}

export async function POST(req: NextRequest) {
  const { householdId, key } = await req.json()
  if (!householdId || !key) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await adminSupabase
    .from('households')
    .update({ encryption_key: key })
    .eq('id', householdId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
