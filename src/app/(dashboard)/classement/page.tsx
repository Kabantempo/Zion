'use client'

import { Suspense, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
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

function EvolutionChart({ logs, members, period }: { logs: any[]; members: any[]; period: Period }) {
  const [chartType, setChartType] = useState<'line' | 'bar'>('line')
  const [hiddenPids, setHiddenPids] = useState<Set<string>>(new Set())
  const [logFilter, setLogFilter] = useState<'all' | 'tasks' | 'tickets'>('all')

  function togglePid(pid: string) {
    setHiddenPids(prev => { const s = new Set(prev); s.has(pid) ? s.delete(pid) : s.add(pid); return s })
  }

  const filteredLogs = logs.filter(l => logFilter === 'all' ? true : logFilter === 'tickets' ? l.isTicket : !l.isTicket)

  const numDays = period === 'week' ? 7 : period === 'month' ? 30 : 90
  const W = 340, H = 140, PAD = { top: 10, right: 10, bottom: 24, left: 32 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const now = new Date()
  const days: string[] = []
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000)
    days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
  }

  const dailyByProfile: Record<string, number[]> = {}
  for (const m of members) {
    const pid = m.profile_id || m.userId
    dailyByProfile[pid] = Array(numDays).fill(0)
  }
  for (const log of filteredLogs) {
    const logDay = log.done_at?.slice(0, 10)
    const idx = days.indexOf(logDay)
    if (idx !== -1 && dailyByProfile[log.done_by] !== undefined) {
      dailyByProfile[log.done_by][idx] += log.points_awarded
    }
  }

  const cumulative: Record<string, number[]> = {}
  for (const [pid, daily] of Object.entries(dailyByProfile)) {
    cumulative[pid] = []
    let sum = 0
    for (const v of daily) { sum += v; cumulative[pid].push(sum) }
  }

  const totals: Record<string, number> = {}
  for (const [pid, cum] of Object.entries(cumulative)) totals[pid] = cum[numDays - 1] ?? 0

  const maxCum = Math.max(1, ...Object.values(cumulative).flatMap(arr => arr))
  const maxTotal = Math.max(1, ...Object.values(totals))

  function toX(i: number) { return PAD.left + (i / (numDays - 1)) * innerW }
  function toY(v: number) { return PAD.top + innerH - (v / maxCum) * innerH }
  function polyline(pts: number[]) { return pts.map((v, i) => `${toX(i)},${toY(v)}`).join(' ') }

  const xTickCount = numDays <= 7 ? numDays - 1 : 4
  const xTicks = Array.from({ length: xTickCount + 1 }, (_, i) => Math.round(i * (numDays - 1) / xTickCount))
  const yTicks = [0, Math.round(maxCum / 2), maxCum]

  const memberList = members.map((m: any) => {
    const p = Array.isArray(m.profile) ? m.profile[0] : (m.profile ?? m)
    return { pid: m.profile_id || m.userId, color: p?.color ?? m.color ?? '#6366f1', name: p?.display_name ?? m.userName ?? '?' }
  })

  // Bar chart: horizontal bars sorted by total
  const barMembers = [...memberList].sort((a, b) => (totals[b.pid] ?? 0) - (totals[a.pid] ?? 0))
  const BAR_H = 340, BAR_W = 200, ROW = Math.floor(BAR_H / barMembers.length)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest">
          {chartType === 'line' ? 'Évolution' : 'Total pts'}
          {period === 'week' ? ' — 7j' : period === 'month' ? ' — 30j' : ' — 90j'}
        </p>
        <div className="flex gap-1">
          {(['all', 'tasks', 'tickets'] as const).map(f => (
            <button key={f} onClick={() => setLogFilter(f)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${logFilter === f ? 'bg-[#2e2e3e] text-[#f0f0f8]' : 'text-[#555570] hover:text-[#7070a0]'}`}>
              {f === 'all' ? 'Tout' : f === 'tasks' ? '✅' : '🎫'}
            </button>
          ))}
          {(['line', 'bar'] as const).map(t => (
            <button key={t} onClick={() => setChartType(t)}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-all ${chartType === t ? 'bg-red-500 text-white' : 'text-[#555570] hover:text-[#f0f0f8]'}`}>
              {t === 'line' ? '📈' : '📊'}
            </button>
          ))}
        </div>
      </div>

      {chartType === 'line' ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 160 }}>
          {yTicks.map(v => (
            <line key={v} x1={PAD.left} y1={toY(v)} x2={PAD.left + innerW} y2={toY(v)} stroke="#2e2e3e" strokeWidth="1" />
          ))}
          {yTicks.map(v => (
            <text key={v} x={PAD.left - 4} y={toY(v) + 4} textAnchor="end" fill="#555570" fontSize="9">{v}</text>
          ))}
          {xTicks.map(i => (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fill="#555570" fontSize="9">
              {i === numDays - 1 ? 'Auj' : `J-${numDays - 1 - i}`}
            </text>
          ))}
          {memberList.filter(({ pid }) => !hiddenPids.has(pid)).map(({ pid, color }) => {
            const pts = cumulative[pid]; if (!pts) return null
            return <polyline key={pid} points={polyline(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          })}
          {memberList.filter(({ pid }) => !hiddenPids.has(pid)).map(({ pid, color }) => {
            const pts = cumulative[pid]; if (!pts) return null
            return <circle key={pid} cx={toX(numDays - 1)} cy={toY(pts[numDays - 1])} r="3" fill={color} stroke="#13131a" strokeWidth="1.5" />
          })}
        </svg>
      ) : (
        <div className="flex flex-col gap-2">
          {barMembers.filter(({ pid }) => !hiddenPids.has(pid)).map(({ pid, color, name }) => {
            const val = totals[pid] ?? 0
            const pct = maxTotal > 0 ? (val / maxTotal) * 100 : 0
            return (
              <div key={pid} className="flex items-center gap-2">
                <span className="text-[10px] text-[#7070a0] w-16 truncate text-right">{name}</span>
                <div className="flex-1 h-5 bg-[#1e1e2a] rounded-lg overflow-hidden">
                  <div className="h-full rounded-lg transition-all duration-500 flex items-center pl-2"
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}>
                    {pct > 20 && <span className="text-[9px] font-bold text-white">{val}</span>}
                  </div>
                </div>
                {pct <= 20 && <span className="text-[9px] font-bold text-[#f0f0f5] w-8">{val}</span>}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 mt-3">
        {memberList.map(({ pid, color, name }) => (
          <div key={pid} className="flex items-center gap-1.5 cursor-pointer select-none transition-opacity"
            style={{ opacity: hiddenPids.has(pid) ? 0.3 : 1 }}
            onClick={() => togglePid(pid)}>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-[#8888a0]">{name}</span>
            <span className="text-[10px] font-bold text-[#f0f0f5]">{totals[pid] ?? 0}pts</span>
          </div>
        ))}
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
  const [equilSheet, setEquilSheet] = useState<{ memberId: string; points: string; loading: boolean } | null>(null)
  const [equilError, setEquilError] = useState<string | null>(null)
  const [assignSheet, setAssignSheet] = useState<{ taskId: string; memberId: string; loading: boolean } | null>(null)
  const [assignError, setAssignError] = useState<string | null>(null)
  const [taskTypes, setTaskTypes] = useState<any[]>([])

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

    let ticketsQuery = supabase.from('tickets').select('completed_by, points, completed_at').eq('household_id', householdId).eq('status', 'done')
    if (since) ticketsQuery = ticketsQuery.gte('completed_at', since)

    const [{ data: logs }, { data: membersData }, { data: allTimeLogs }, { data: ticketLogs }] = await Promise.all([
      logsQuery,
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_logs').select('done_by, done_at').eq('household_id', householdId).order('done_at', { ascending: false }),
      ticketsQuery,
    ])

    const validTickets = (ticketLogs ?? []).filter((t: any) => t.completed_by && t.completed_at && (t.points ?? 0) > 0)
    const ticketAsLogs = validTickets.map((t: any) => ({ done_by: t.completed_by, points_awarded: t.points, done_at: t.completed_at, isTicket: true }))
    setRawLogs([...(logs ?? []).map((l: any) => ({ ...l, isTicket: false })), ...ticketAsLogs])
    setMembers(membersData ?? [])

    const pointsByProfile: Record<string, number> = {}
    for (const log of logs ?? []) {
      pointsByProfile[log.done_by] = (pointsByProfile[log.done_by] ?? 0) + log.points_awarded
    }
    for (const t of validTickets) {
      pointsByProfile[t.completed_by] = (pointsByProfile[t.completed_by] ?? 0) + (t.points ?? 0)
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

    // Fetch task types for assign sheet
    const { data: tt } = await supabase.from('task_types').select('id, label, category, points').eq('household_id', householdId).order('category').order('label')
    setTaskTypes(tt ?? [])

    setData({ sorted, profileId, period, householdId })
    setLoading(false)
  }

  async function submitAssign() {
    if (!assignSheet || !data) return
    if (!assignSheet.taskId || !assignSheet.memberId) { setAssignError('Choisis une tâche et un membre'); return }
    setAssignSheet(prev => prev ? { ...prev, loading: true } : null)
    const task = taskTypes.find((t: any) => t.id === assignSheet.taskId)
    const { error } = await supabase.from('tickets').insert({
      household_id: data.householdId,
      title: task?.label ?? 'Tâche assignée',
      description: `👑 Assignée par le champion du mois`,
      assigned_to: assignSheet.memberId,
      points: task?.points ?? 10,
      status: 'todo',
    })
    if (error) { setAssignError(error.message); setAssignSheet(prev => prev ? { ...prev, loading: false } : null); return }
    setAssignSheet(null)
    setAssignError(null)
  }

  async function submitEquil() {
    if (!equilSheet || !data) return
    setEquilError(null)
    setEquilSheet(prev => prev ? { ...prev, loading: true } : null)
    const pts = parseInt(equilSheet.points)
    if (isNaN(pts) || pts === 0) {
      setEquilError('Entre un nombre différent de 0')
      setEquilSheet(prev => prev ? { ...prev, loading: false } : null)
      return
    }

    try {
      const res = await fetch('/api/equil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId: data.householdId, memberId: equilSheet.memberId, points: pts }),
      })
      const json = await res.json()
      if (res.ok) {
        setEquilSheet(null)
        setEquilError(null)
        load(data.profileId, data.householdId)
      } else {
        setEquilError(json.error ?? `Erreur ${res.status}`)
        setEquilSheet(prev => prev ? { ...prev, loading: false } : null)
      }
    } catch (e: any) {
      setEquilError(e?.message ?? 'Erreur réseau')
      setEquilSheet(prev => prev ? { ...prev, loading: false } : null)
    }
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
      {/* Period tabs + equil button */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 p-1 bg-[#13131a] rounded-2xl border border-[#252535] overflow-x-auto">
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
        <button
          onClick={() => sorted.length > 0 && setEquilSheet({ memberId: sorted[0].userId, points: '10', loading: false })}
          className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-2xl bg-[#13131a] border border-[#252535] text-base hover:bg-[#1a1a24] active:scale-95 transition-all"
          title="Équilibrage de points"
        >⚖️</button>
        {/* 👑 Assign button — visible only to the #1 player */}
        {sorted.length > 0 && sorted[0].userId === profileId && period === 'month' && (
          <button
            onClick={() => setAssignSheet({ taskId: taskTypes[0]?.id ?? '', memberId: sorted[1]?.userId ?? sorted[0].userId, loading: false })}
            className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-2xl bg-yellow-500/15 border border-yellow-500/30 text-base hover:bg-yellow-500/25 active:scale-95 transition-all"
            title="Assigner une tâche (privilège du champion)"
          >👑</button>
        )}
      </div>

      {/* Equil sheet */}
      {equilSheet && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setEquilSheet(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-5 pb-10 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">⚖️ Équilibrage de points</h3>
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2">Membre</p>
              <div className="flex flex-col gap-1.5">
                {sorted.map((m: any) => (
                  <button key={m.userId} type="button" onClick={() => setEquilSheet(prev => prev ? { ...prev, memberId: m.userId } : null)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-left ${equilSheet.memberId === m.userId ? 'bg-red-500/20 border border-red-500/40' : 'bg-[#22222e] border border-transparent'}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden" style={{ backgroundColor: m.color ?? '#555' }}>
                      {m.avatarUrl ? <img src={m.avatarUrl} className="w-full h-full object-cover" /> : m.userName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-[#f0f0f5] flex-1">{m.userName}</span>
                    <span className="text-xs text-[#7070a0]">{m.value} pts</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2">Points à ajouter <span className="text-[#555570]">(négatif pour retirer)</span></p>
              <input
                type="number"
                value={equilSheet.points}
                onChange={(e) => setEquilSheet(prev => prev ? { ...prev, points: e.target.value } : null)}
                className="w-full px-4 py-3 rounded-xl bg-[#22222e] border border-[#2e2e3e] text-[#f0f0f5] text-lg font-bold outline-none focus:border-red-500 text-center"
                placeholder="10"
              />
            </div>
            {equilError && (
              <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-xl px-3 py-2">{equilError}</p>
            )}
            <button
              onClick={submitEquil}
              disabled={equilSheet.loading}
              className="w-full py-3 rounded-xl bg-red-500 text-white font-bold text-sm disabled:opacity-50"
            >
              {equilSheet.loading ? '…' : `Appliquer ${parseInt(equilSheet.points) > 0 ? '+' : ''}${equilSheet.points || 0} pts`}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Assign sheet */}
      {assignSheet && createPortal(
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setAssignSheet(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-5 pb-10 flex flex-col gap-4 max-h-[85dvh]" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">👑 Assigner une tâche</h3>
            <p className="text-xs text-[#7070a0] -mt-2">Privilège du champion — choisis une tâche et un membre</p>
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2">Tâche</p>
              <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                {taskTypes.map((t: any) => (
                  <button key={t.id} type="button" onClick={() => setAssignSheet(prev => prev ? { ...prev, taskId: t.id } : null)}
                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl transition-all text-left ${assignSheet.taskId === t.id ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-[#22222e] border border-transparent'}`}>
                    <span className="text-sm text-[#f0f0f5]">{t.label}</span>
                    <span className="text-xs text-yellow-400 font-bold">+{t.points}pts</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-2">Membre</p>
              <div className="flex flex-col gap-1.5">
                {sorted.map((m: any) => (
                  <button key={m.userId} type="button" onClick={() => setAssignSheet(prev => prev ? { ...prev, memberId: m.userId } : null)}
                    className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-left ${assignSheet.memberId === m.userId ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-[#22222e] border border-transparent'}`}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 overflow-hidden" style={{ backgroundColor: m.color ?? '#555' }}>
                      {m.avatarUrl ? <img src={m.avatarUrl} className="w-full h-full object-cover" /> : m.userName.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-[#f0f0f5] flex-1">{m.userName}</span>
                  </button>
                ))}
              </div>
            </div>
            {assignError && <p className="text-xs text-red-400 text-center bg-red-500/10 rounded-xl px-3 py-2">{assignError}</p>}
            <button onClick={submitAssign} disabled={assignSheet.loading}
              className="w-full py-3 rounded-xl bg-yellow-500 text-black font-bold text-sm disabled:opacity-50">
              {assignSheet.loading ? '…' : 'Assigner la tâche 👑'}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Evolution chart */}
      {rawLogs.length > 0 && members.length > 0 && (
        <div className="bg-[#13131a] border border-[#252535] rounded-2xl p-4">
          <EvolutionChart logs={rawLogs} members={members} period={period} />
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
