'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { LeaderboardPodium, type LeaderboardRanking as PodiumRanking } from '@/components/ui/leaderboard-podium'
import { LeaderboardRankings, type LeaderboardRankingItem } from '@/components/ui/leaderboard-rankings'
import { getLevel, getLevelName } from '@/lib/utils'
import type { Profile } from '@/types'

type Period = 'week' | 'month' | 'all'

export default function ClassementPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <ClassementContent />
    </Suspense>
  )
}

function ClassementContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const period = (['week', 'month', 'all'].includes(searchParams.get('period') ?? '') ? searchParams.get('period') : 'month') as Period
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [period])

  async function load(profileId: string, householdId: string) {
    let since: string | undefined
    if (period === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString()
    else if (period === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString()

    let logsQuery = supabase.from('task_logs').select('done_by, points_awarded, done_at').eq('household_id', householdId)
    if (since) logsQuery = logsQuery.gte('done_at', since)

    const [{ data: logs }, { data: members }, { data: allTimeLogs }] = await Promise.all([
      logsQuery,
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_logs').select('done_by, done_at').eq('household_id', householdId).order('done_at', { ascending: false }),
    ])

    const pointsByProfile: Record<string, number> = {}
    for (const log of logs ?? []) {
      pointsByProfile[log.done_by] = (pointsByProfile[log.done_by] ?? 0) + log.points_awarded
    }

    function calcStreak(pid: string): number {
      const userLogs = (allTimeLogs ?? []).filter((l: any) => l.done_by === pid)
      const days = new Set(userLogs.map((l: any) => new Date(l.done_at).toDateString()))
      let streak = days.has(new Date().toDateString()) ? 1 : 0
      let d = new Date(Date.now() - 86400000)
      while (days.has(d.toDateString())) { streak++; d = new Date(d.getTime() - 86400000) }
      return streak
    }

    const sorted = (members ?? [])
      .map((m: any) => {
        const p = (Array.isArray(m.profile) ? m.profile[0] : m.profile) as Profile
        if (!p) return null
        const points = pointsByProfile[m.profile_id] ?? 0
        const level = getLevel(points)
        return {
          userId: m.profile_id,
          userName: p.display_name,
          color: p.color,
          avatarUrl: p.avatar_url,
          value: points,
          level,
          streak: calcStreak(m.profile_id),
          byline: `Nv.${level} · ${getLevelName(level)} · ${calcStreak(m.profile_id)}🔥`,
        }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.value - a.value)

    setData({ sorted, profileId, period })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  const { sorted, profileId } = data

  const podiumRankings: PodiumRanking[] = sorted
    .slice(0, 3)
    .map((e: any, i: number) => ({ ...e, rank: (i + 1) as 1 | 2 | 3 }))

  const rankingItems: LeaderboardRankingItem[] = sorted.map((e: any, i: number) => ({
    ...e,
    rank: i + 1,
    displayed: true,
  }))

  const now = new Date()
  let fromDate: Date
  if (period === 'week') fromDate = new Date(now.getTime() - 7 * 86400000)
  else if (period === 'month') fromDate = new Date(now.getTime() - 30 * 86400000)
  else fromDate = new Date('2024-01-01')

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Period tabs */}
      <div className="flex p-1 bg-[#13131a] rounded-2xl border border-[#252535]">
        {([['week', 'Cette semaine'], ['month', 'Ce mois'], ['all', 'All time']] as const).map(([p, label]) => (
          <a
            key={p}
            href={`?period=${p}`}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all text-center ${period === p ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-[#7070a0] hover:text-[#f0f0f8]'}`}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Podium */}
      {podiumRankings.length > 0 && (
        <div className="bg-[#13131a] border border-[#252535] rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest text-center mb-5">Podium</p>
          <LeaderboardPodium rankings={podiumRankings} />
        </div>
      )}

      {/* Full rankings */}
      {rankingItems.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-2 px-1">Classement complet</p>
          <LeaderboardRankings
            rankings={rankingItems}
            currentUserId={profileId}
            showPagination
            defaultPageSize={10}
          />
        </div>
      )}

      {sorted.length === 0 && (
        <div className="text-center py-16 text-[#7070a0]">
          <p className="text-4xl mb-3">🏆</p>
          <p className="font-medium">Aucun point pour cette période</p>
          <p className="text-sm mt-1">Complète des tâches pour apparaître ici !</p>
        </div>
      )}
    </div>
  )
}
