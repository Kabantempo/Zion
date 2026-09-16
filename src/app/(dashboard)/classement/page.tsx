'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { LeaderboardPodium, type LeaderboardRanking as PodiumRanking } from '@/components/ui/leaderboard-podium'
import { LeaderboardRankings, type LeaderboardRankingItem } from '@/components/ui/leaderboard-rankings'
import { getLevel, getLevelName } from '@/lib/utils'
import type { Profile } from '@/types'

type Period = 'week' | 'month' | 'all' | 'history'

export default function ClassementPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>}>
      <ClassementContent />
    </Suspense>
  )
}

function EvolutionChart({ logs, members }: { logs: any[]; members: any[] }) {
  const W = 340, H = 140, PAD = { top: 10, right: 10, bottom: 24, left: 28 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  // Build daily cumulative points per profile over last 30 days
  const now = new Date()
  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const dailyByProfile: Record<string, number[]> = {}
  for (const m of members) {
    const pid = m.profile_id || m.userId
    dailyByProfile[pid] = Array(30).fill(0)
  }
  for (const log of logs) {
    const logDay = log.done_at?.slice(0, 10)
    const idx = days.indexOf(logDay)
    if (idx !== -1 && dailyByProfile[log.done_by] !== undefined) {
      dailyByProfile[log.done_by][idx] += log.points_awarded
    }
  }

  // Cumulative
  const cumulative: Record<string, number[]> = {}
  for (const [pid, daily] of Object.entries(dailyByProfile)) {
    cumulative[pid] = []
    let sum = 0
    for (const v of daily) { sum += v; cumulative[pid].push(sum) }
  }

  const maxVal = Math.max(1, ...Object.values(cumulative).flatMap(arr => arr))

  function toX(i: number) { return PAD.left + (i / 29) * innerW }
  function toY(v: number) { return PAD.top + innerH - (v / maxVal) * innerH }

  function polyline(pts: number[]) {
    return pts.map((v, i) => `${toX(i)},${toY(v)}`).join(' ')
  }

  // Y-axis ticks
  const yTicks = [0, Math.round(maxVal / 2), maxVal]
  // X-axis ticks: every 7 days
  const xTicks = [0, 7, 14, 21, 29]

  return (
    <div>
      <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Évolution des points</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
        {/* Grid lines */}
        {yTicks.map(v => (
          <line key={v} x1={PAD.left} y1={toY(v)} x2={PAD.left + innerW} y2={toY(v)}
            stroke="#2e2e3e" strokeWidth="1" />
        ))}
        {/* Y axis labels */}
        {yTicks.map(v => (
          <text key={v} x={PAD.left - 4} y={toY(v) + 4} textAnchor="end"
            fill="#555570" fontSize="9">{v}</text>
        ))}
        {/* X axis labels */}
        {xTicks.map(i => (
          <text key={i} x={toX(i)} y={H - 4} textAnchor="middle"
            fill="#555570" fontSize="9">
            {`J-${29 - i}`}
          </text>
        ))}
        {/* Lines */}
        {members.map((m: any) => {
          const pid = m.profile_id || m.userId
          const pts = cumulative[pid]
          if (!pts) return null
          const p = Array.isArray(m.profile) ? m.profile[0] : (m.profile ?? m)
          const color = p?.color ?? m.color ?? '#6366f1'
          return (
            <polyline key={pid} points={polyline(pts)}
              fill="none" stroke={color} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" />
          )
        })}
        {/* Endpoint dots */}
        {members.map((m: any) => {
          const pid = m.profile_id || m.userId
          const pts = cumulative[pid]
          if (!pts) return null
          const p = Array.isArray(m.profile) ? m.profile[0] : (m.profile ?? m)
          const color = p?.color ?? m.color ?? '#6366f1'
          const lastVal = pts[29]
          return (
            <circle key={pid} cx={toX(29)} cy={toY(lastVal)} r="3"
              fill={color} stroke="#13131a" strokeWidth="1.5" />
          )
        })}
      </svg>
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2">
        {members.map((m: any) => {
          const p = Array.isArray(m.profile) ? m.profile[0] : (m.profile ?? m)
          const color = p?.color ?? m.color ?? '#6366f1'
          const name = p?.display_name ?? m.userName ?? '?'
          const pid = m.profile_id || m.userId
          const total = cumulative[pid]?.[29] ?? 0
          return (
            <div key={pid} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[10px] text-[#8888a0]">{name}</span>
              <span className="text-[10px] font-bold text-[#f0f0f5]">{total}pts</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ClassementContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const period = (['week', 'month', 'all', 'history'].includes(searchParams.get('period') ?? '') ? searchParams.get('period') : 'month') as Period
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [rawLogs, setRawLogs] = useState<any[]>([])
  const [members, setMembers] = useState<any[]>([])
  const [profileSheet, setProfileSheet] = useState<{ item: any; logs: any[] } | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    if (period === 'history') {
      loadHistory(session.householdId)
    } else {
      load(session.profileId, session.householdId)
    }
  }, [period])

  async function loadHistory(householdId: string) {
    setLoading(true)
    const { data: logs } = await supabase
      .from('task_logs')
      .select('id, done_at, points_awarded, task:task_types(label, category), doer:profiles!done_by(display_name, color, avatar_url)')
      .eq('household_id', householdId)
      .order('done_at', { ascending: false })
      .limit(100)
    setHistoryData(logs ?? [])
    setLoading(false)
  }

  async function load(profileId: string, householdId: string) {
    let since: string | undefined
    if (period === 'week') since = new Date(Date.now() - 7 * 86400000).toISOString()
    else if (period === 'month') since = new Date(Date.now() - 30 * 86400000).toISOString()

    let logsQuery = supabase.from('task_logs').select('done_by, points_awarded, done_at').eq('household_id', householdId)
    if (since) logsQuery = logsQuery.gte('done_at', since)

    const [{ data: logs }, { data: membersData }, { data: allTimeLogs }] = await Promise.all([
      logsQuery,
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_logs').select('done_by, done_at').eq('household_id', householdId).order('done_at', { ascending: false }),
    ])

    setRawLogs(logs ?? [])
    setMembers(membersData ?? [])

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

    const sorted = (membersData ?? [])
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

    setData({ sorted, profileId, period, householdId })
    setLoading(false)
  }

  async function openProfile(item: any) {
    setLoadingProfile(true)
    setProfileSheet({ item, logs: [] })
    const session = getProfileSession()
    if (!session) return
    const [{ data: logs }, { data: tickets }] = await Promise.all([
      supabase
        .from('task_logs')
        .select('id, done_at, points_awarded, task_type:task_types(label)')
        .eq('done_by', item.userId)
        .eq('household_id', session.householdId)
        .order('done_at', { ascending: false })
        .limit(50),
      supabase
        .from('tickets')
        .select('id, completed_at, points, title')
        .eq('completed_by', item.userId)
        .eq('household_id', session.householdId)
        .eq('status', 'done')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(50),
    ])
    const taskLogs = (logs ?? []).map((l: any) => ({ ...l, isTicket: false }))
    const ticketLogs = (tickets ?? []).map((t: any) => ({
      id: `ticket-${t.id}`,
      done_at: t.completed_at,
      points_awarded: t.points ?? 0,
      task_type: { label: t.title },
      isTicket: true,
    }))
    const merged = [...taskLogs, ...ticketLogs].sort((a, b) => new Date(b.done_at).getTime() - new Date(a.done_at).getTime())
    setProfileSheet({ item, logs: merged })
    setLoadingProfile(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  if (period === 'history') {
    function groupByDay(logs: any[]) {
      const groups: Record<string, any[]> = {}
      for (const log of logs) {
        const day = new Date(log.done_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
        if (!groups[day]) groups[day] = []
        groups[day].push(log)
      }
      return groups
    }
    const grouped = groupByDay(historyData)
    return (
      <div className="p-4 flex flex-col gap-4 animate-slide-up">
        <div className="flex p-1 bg-[#13131a] rounded-2xl border border-[#252535] overflow-x-auto">
          {([['week', 'Semaine'], ['month', 'Mois'], ['all', 'All time'], ['history', 'Historique']] as const).map(([p, label]) => (
            <a key={p} href={`?period=${p}`} className={`flex-shrink-0 flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-center ${period === p ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-[#7070a0] hover:text-[#f0f0f8]'}`}>{label}</a>
          ))}
        </div>
        {historyData.length === 0 ? (
          <div className="text-center py-16 text-[#7070a0]">
            <p className="font-medium">Aucune tâche complétée</p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {Object.entries(grouped).map(([day, logs]) => (
              <div key={day}>
                <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-2 capitalize">{day}</p>
                <div className="flex flex-col gap-2">
                  {logs.map((log: any) => {
                    const doer = Array.isArray(log.doer) ? log.doer[0] : log.doer
                    const task = Array.isArray(log.task) ? log.task[0] : log.task
                    const time = new Date(log.done_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={log.id} className="flex items-center gap-3 bg-[#13131a] border border-[#252535] rounded-xl px-3 py-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden" style={{ backgroundColor: doer?.color ?? '#6366f1' }}>
                          {doer?.avatar_url ? <img src={doer.avatar_url} className="w-full h-full object-cover" /> : doer?.display_name?.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#f0f0f8] truncate">{task?.label ?? 'Tâche'}</p>
                          <p className="text-xs text-[#7070a0]">{doer?.display_name} · {time}</p>
                        </div>
                        <span className="text-sm font-bold text-red-400 flex-shrink-0">+{log.points_awarded} pts</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (!data) return null
  const { sorted, profileId } = data

  const podiumRankings: PodiumRanking[] = sorted
    .slice(0, 3)
    .map((e: any, i: number) => ({ ...e, rank: (i + 1) as 1 | 2 | 3 }))

  const rankingItems: LeaderboardRankingItem[] = sorted.map((e: any, i: number) => ({
    ...e,
    rank: i + 1,
    displayed: true,
  }))

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {/* Period tabs */}
      <div className="flex p-1 bg-[#13131a] rounded-2xl border border-[#252535] overflow-x-auto">
        {([['week', 'Semaine'], ['month', 'Mois'], ['all', 'All time'], ['history', 'Historique']] as const).map(([p, label]) => (
          <a
            key={p}
            href={`?period=${p}`}
            className={`flex-shrink-0 flex-1 py-2 text-xs font-semibold rounded-xl transition-all text-center ${period === p ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'text-[#7070a0] hover:text-[#f0f0f8]'}`}
          >
            {label}
          </a>
        ))}
      </div>

      {/* Evolution chart */}
      {rawLogs.length > 0 && members.length > 0 && (
        <div className="bg-[#13131a] border border-[#252535] rounded-2xl p-4">
          <EvolutionChart logs={rawLogs} members={members} />
        </div>
      )}

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
            onProfileClick={openProfile}
          />
        </div>
      )}

      {/* Profile detail sheet */}
      {profileSheet && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setProfileSheet(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-5 flex flex-col gap-4 max-h-[80dvh] animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-black text-white flex-shrink-0 overflow-hidden" style={{ backgroundColor: profileSheet.item.color ?? '#555' }}>
                {profileSheet.item.avatarUrl
                  ? <img src={profileSheet.item.avatarUrl} className="w-full h-full object-cover" />
                  : profileSheet.item.userName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="text-base font-bold text-[#f0f0f5]">{profileSheet.item.userName}</p>
                <p className="text-xs text-[#7070a0]">{profileSheet.item.byline}</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-xl font-black text-[#f0f0f5]">{profileSheet.item.value.toLocaleString()}</p>
                <p className="text-xs text-[#7070a0]">points</p>
              </div>
            </div>
            {/* Logs */}
            <div className="overflow-y-auto flex-1">
              <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Dernières actions</p>
              {loadingProfile ? (
                <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : profileSheet.logs.length === 0 ? (
                <p className="text-sm text-[#555570] text-center py-6">Aucune action enregistrée</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {profileSheet.logs.map((log: any) => {
                    const task = Array.isArray(log.task_type) ? log.task_type[0] : log.task_type
                    const date = new Date(log.done_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                    const time = new Date(log.done_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                    return (
                      <div key={log.id} className="flex items-center gap-3 bg-[#13131a] border border-[#252535] rounded-xl px-3 py-2.5">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {log.isTicket && <span className="text-[10px] bg-[#2e2e3e] text-[#7070a0] px-1.5 py-0.5 rounded-md flex-shrink-0">🎫</span>}
                            <p className="text-sm font-medium text-[#f0f0f5] truncate">{task?.label ?? '?'}</p>
                          </div>
                          <p className="text-xs text-[#555570]">{date} à {time}</p>
                        </div>
                        <span className="text-sm font-bold text-yellow-400 flex-shrink-0">+{log.points_awarded}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <button onClick={() => setProfileSheet(null)} className="text-sm text-[#7070a0] text-center py-1">Fermer</button>
          </div>
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
