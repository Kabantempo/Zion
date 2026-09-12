import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@supabase/supabase-js'
import webPush from 'web-push'

webPush.setVapidDetails(
  'mailto:kalvinpaviel4@gmail.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

const adminSupabase = createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const { householdId, excludeProfileId, title, body, url } = await req.json()
  if (!householdId || !title) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: subs } = await adminSupabase
    .from('push_subscriptions')
    .select('subscription, profile_id')
    .eq('household_id', householdId)
    .neq('profile_id', excludeProfileId ?? '')

  if (!subs?.length) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/accueil' })
  let sent = 0

  for (const sub of subs) {
    try {
      await webPush.sendNotification(sub.subscription, payload)
      sent++
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await adminSupabase.from('push_subscriptions').delete().eq('profile_id', sub.profile_id)
      }
    }
  }

  return NextResponse.json({ ok: true, sent })
}
