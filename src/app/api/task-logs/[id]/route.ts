import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // Verify the log exists and get done_by + household_id
  const { data: log, error: fetchErr } = await adminSupabase
    .from('task_logs')
    .select('id, done_by, household_id')
    .eq('id', id)
    .single()

  if (fetchErr || !log) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { error } = await adminSupabase.from('task_logs').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
