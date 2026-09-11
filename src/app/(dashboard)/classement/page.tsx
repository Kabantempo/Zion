import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { getLevel, getLevelName, getPointsForNextLevel } from '@/lib/utils'
import type { Profile } from '@/types'

type Period = 'week' | 'month' | 'all'

export default async function ClassementPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const params = await searchParams
  const period: Period = (['week', 'month', 'all'].includes(params.period ?? '') ? params.period : 'month') as Period

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', user.id)
    .single()
  if (!membership) redirect('/onboarding')

  const householdId = membership.household_id

  let since: string | undefined
  if (period === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString()
  else if (period === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString()

  const logsQuery = supabase.from('task_logs').select('done_by, points_awarded, done_at').eq('household_id', householdId)
  if (since) logsQuery.gte('done_at', since)

  const [{ data: logs }, { data: members }] = await Promise.all([
    logsQuery,
    supabase.from('household_members')
      .select('user_id, profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId),
  ])

  // Build leaderboard
  const pointsByUser: Record<string, number> = {}
  for (const log of logs ?? []) {
    pointsByUser[log.done_by] = (pointsByUser[log.done_by] ?? 0) + log.points_awarded
  }

  // Streak calculation per user
  const allTimeLogs = (await supabase.from('task_logs').select('done_by, done_at').eq('household_id', householdId).order('done_at', { ascending: false })).data ?? []

  function calcStreak(userId: string): number {
    const userLogs = allTimeLogs.filter((l) => l.done_by === userId)
    const days = new Set(userLogs.map((l) => new Date(l.done_at).toDateString()))
    const today = new Date().toDateString()
    if (!days.has(today) && !days.has(new Date(Date.now() - 86400000).toDateString())) return 0
    let streak = days.has(today) ? 1 : 0
    let d = new Date(Date.now() - (streak ? 1 : 0) * 86400000)
    while (streak < 365) {
      if (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 86400000) }
      else break
    }
    return streak
  }

  const leaderboard = (members ?? [])
    .map((m) => {
      const p = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile
      if (!p) return null
      const points = pointsByUser[m.user_id] ?? 0
      return {
        user_id: m.user_id,
        display_name: p.display_name,
        color: p.color,
        avatar_url: p.avatar_url,
        points,
        level: getLevel(points),
        streak: calcStreak(m.user_id),
      }
    })
    .filter(Boolean)
    .sort((a, b) => b!.points - a!.points)

  const myEntry = leaderboard.find((e) => e?.user_id === user.id)

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Period selector */}
      <div className="flex p-1 bg-[#1a1a24] rounded-xl border border-[#2e2e3e]">
        {([['week', 'Cette semaine'], ['month', 'Ce mois'], ['all', 'All time']] as const).map(([p, label]) => (
          <a key={p} href={`?period=${p}`} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all text-center ${period === p ? 'bg-indigo-500 text-white' : 'text-[#8888a0]'}`}>
            {label}
          </a>
        ))}
      </div>

      {/* My rank highlight */}
      {myEntry && (
        <Card className="border-indigo-500/30 bg-indigo-500/5">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-indigo-400">#{leaderboard.findIndex((e) => e?.user_id === user.id) + 1}</span>
            <Avatar name={myEntry.display_name} color={myEntry.color} avatarUrl={myEntry.avatar_url} size="md" />
            <div className="flex-1">
              <p className="font-bold text-[#f0f0f5]">{myEntry.display_name}</p>
              <p className="text-xs text-[#8888a0]">Nv.{myEntry.level} · {getLevelName(myEntry.level)}</p>
            </div>
            <div className="text-right">
              <p className="font-black text-indigo-400">{myEntry.points} pts</p>
              <p className="text-xs text-orange-400">{myEntry.streak} 🔥</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs text-[#8888a0] mb-1">
              <span>Niveau {myEntry.level}</span>
              <span>Niveau {myEntry.level + 1}</span>
            </div>
            <div className="h-2 bg-[#2e2e3e] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, ((myEntry.points - getPointsForNextLevel(myEntry.points).current) / (getPointsForNextLevel(myEntry.points).next - getPointsForNextLevel(myEntry.points).current)) * 100)}%`
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Full leaderboard */}
      <div>
        <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Classement</h3>
        <div className="flex flex-col gap-2">
          {leaderboard.map((entry, i) => {
            if (!entry) return null
            const isMe = entry.user_id === user.id
            const medals = ['🥇', '🥈', '🥉']
            return (
              <Card key={entry.user_id} className={isMe ? 'border-indigo-500/30' : ''}>
                <div className="flex items-center gap-3">
                  <span className="text-lg w-8 text-center">{medals[i] ?? `${i + 1}`}</span>
                  <Avatar name={entry.display_name} color={entry.color} avatarUrl={entry.avatar_url} size="sm" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#f0f0f5]">{entry.display_name} {isMe && '(moi)'}</p>
                    <p className="text-xs text-[#8888a0]">Nv.{entry.level} · {entry.streak} 🔥</p>
                  </div>
                  <span className="font-bold text-[#f0f0f5]">{entry.points} pts</span>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
