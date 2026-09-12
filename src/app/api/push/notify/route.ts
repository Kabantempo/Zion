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

  // List all subscription files for this household
  const { data: files, error: listErr } = await adminSupabase.storage.from('push').list(householdId)
  if (listErr || !files?.length) return NextResponse.json({ ok: true, sent: 0 })

  const payload = JSON.stringify({ title, body: body ?? '', url: url ?? '/accueil' })
  let sent = 0

  for (const file of files) {
    const profileId = file.name.replace('.json', '')
    if (profileId === excludeProfileId) continue

    // Download subscription data
    const { data: blob } = await adminSupabase.storage.from('push').download(`${householdId}/${file.name}`)
    if (!blob) continue
    const text = await blob.text()
    let subData: any
    try { subData = JSON.parse(text) } catch { continue }

    try {
      await webPush.sendNotification(subData.subscription, payload)
      sent++
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await adminSupabase.storage.from('push').remove([`${householdId}/${file.name}`])
      }
    }
  }

  return NextResponse.json({ ok: true, sent })
}
