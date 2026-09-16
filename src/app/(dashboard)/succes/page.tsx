'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'

interface Achievement {
  id: string
  emoji: string
  label: string
  desc: string
  tier: 'bronze' | 'silver' | 'gold' | 'diamond'
  check: (stats: MemberStats) => boolean
  progress: (stats: MemberStats) => { current: number; total: number }
}

interface MemberStats {
  totalTasks: number
  totalPoints: number
  maxStreak: number
  uniqueCategories: number
  totalCategories: number
  ticketsCompleted: number
  uniqueTasksDone: number
  totalTaskTypes: number
  weekChallengeDone: boolean
}

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_task',   emoji: '🌱', label: 'Premier pas',      desc: '1 tâche complétée',               tier: 'bronze',  check: s => s.totalTasks >= 1,    progress: s => ({ current: Math.min(s.totalTasks, 1), total: 1 }) },
  { id: 'tasks_10',     emoji: '⚡', label: 'En route',         desc: '10 tâches complétées',            tier: 'bronze',  check: s => s.totalTasks >= 10,   progress: s => ({ current: Math.min(s.totalTasks, 10), total: 10 }) },
  { id: 'tasks_50',     emoji: '🔥', label: 'En feu',           desc: '50 tâches complétées',            tier: 'silver',  check: s => s.totalTasks >= 50,   progress: s => ({ current: Math.min(s.totalTasks, 50), total: 50 }) },
  { id: 'tasks_100',    emoji: '💪', label: 'Centurion',        desc: '100 tâches complétées',           tier: 'silver',  check: s => s.totalTasks >= 100,  progress: s => ({ current: Math.min(s.totalTasks, 100), total: 100 }) },
  { id: 'tasks_250',    emoji: '🏅', label: 'Bosseur',          desc: '250 tâches complétées',           tier: 'gold',    check: s => s.totalTasks >= 250,  progress: s => ({ current: Math.min(s.totalTasks, 250), total: 250 }) },
  { id: 'tasks_500',    emoji: '🏆', label: 'Légende',          desc: '500 tâches complétées',           tier: 'diamond', check: s => s.totalTasks >= 500,  progress: s => ({ current: Math.min(s.totalTasks, 500), total: 500 }) },
  { id: 'pts_100',      emoji: '💰', label: 'Premiers euros',   desc: '100 pts gagnés',                  tier: 'bronze',  check: s => s.totalPoints >= 100,  progress: s => ({ current: Math.min(s.totalPoints, 100), total: 100 }) },
  { id: 'pts_500',      emoji: '💎', label: 'Riche',            desc: '500 pts gagnés',                  tier: 'silver',  check: s => s.totalPoints >= 500,  progress: s => ({ current: Math.min(s.totalPoints, 500), total: 500 }) },
  { id: 'pts_1000',     emoji: '👑', label: 'Millionnaire',     desc: '1 000 pts gagnés',                tier: 'gold',    check: s => s.totalPoints >= 1000, progress: s => ({ current: Math.min(s.totalPoints, 1000), total: 1000 }) },
  { id: 'pts_5000',     emoji: '🌟', label: 'Intouchable',      desc: '5 000 pts gagnés',                tier: 'diamond', check: s => s.totalPoints >= 5000, progress: s => ({ current: Math.min(s.totalPoints, 5000), total: 5000 }) },
  { id: 'streak_3',     emoji: '📅', label: 'Régulier',         desc: '3 jours de suite',                tier: 'bronze',  check: s => s.maxStreak >= 3,  progress: s => ({ current: Math.min(s.maxStreak, 3), total: 3 }) },
  { id: 'streak_7',     emoji: '🗓️', label: 'Semaine parfaite', desc: '7 jours de suite',                tier: 'silver',  check: s => s.maxStreak >= 7,  progress: s => ({ current: Math.min(s.maxStreak, 7), total: 7 }) },
  { id: 'streak_14',    emoji: '🌙', label: 'Deux semaines',    desc: '14 jours de suite',               tier: 'gold',    check: s => s.maxStreak >= 14, progress: s => ({ current: Math.min(s.maxStreak, 14), total: 14 }) },
  { id: 'streak_30',    emoji: '🔮', label: 'Mois de feu',      desc: '30 jours de suite',               tier: 'diamond', check: s => s.maxStreak >= 30, progress: s => ({ current: Math.min(s.maxStreak, 30), total: 30 }) },
  { id: 'all_cats',     emoji: '🗂️', label: 'Touche-à-tout',   desc: 'Toutes les catégories',           tier: 'silver',  check: s => s.totalCategories > 0 && s.uniqueCategories >= s.totalCategories, progress: s => ({ current: s.uniqueCategories, total: Math.max(s.totalCategories, 1) }) },
  { id: 'ticket_1',     emoji: '🎫', label: 'Service rendu',    desc: '1 ticket complété',               tier: 'bronze',  check: s => s.ticketsCompleted >= 1,  progress: s => ({ current: Math.min(s.ticketsCompleted, 1), total: 1 }) },
  { id: 'cyberpsycho',  emoji: '🤖', label: 'Cyberpsycho',      desc: '10 tickets complétés',            tier: 'gold',    check: s => s.ticketsCompleted >= 10, progress: s => ({ current: Math.min(s.ticketsCompleted, 10), total: 10 }) },
  { id: 'dead_god',     emoji: '💀', label: 'Dead God',         desc: 'Toutes les tâches au moins 1 fois', tier: 'diamond', check: s => s.totalTaskTypes > 0 && s.uniqueTasksDone >= s.totalTaskTypes, progress: s => ({ current: s.uniqueTasksDone, total: Math.max(s.totalTaskTypes, 1) }) },
  { id: 'week_chall',  emoji: '🎯', label: 'Défi accompli',    desc: 'Compléter un défi de la semaine',   tier: 'gold',    check: s => s.weekChallengeDone, progress: s => ({ current: s.weekChallengeDone ? 1 : 0, total: 1 }) },
]

const TIER_STYLE: Record<string, { card: string; label: string; bar: string }> = {
  bronze:  { card: 'from-orange-900/40 to-orange-800/20 border-orange-700/40', label: 'text-orange-400', bar: 'bg-orange-500' },
  silver:  { card: 'from-slate-700/40 to-slate-600/20 border-slate-500/40',   label: 'text-slate-300',  bar: 'bg-slate-400' },
  gold:    { card: 'from-yellow-900/40 to-yellow-800/20 border-yellow-600/40', label: 'text-yellow-400', bar: 'bg-yellow-500' },
  diamond: { card: 'from-cyan-900/40 to-blue-900/20 border-cyan-500/40',       label: 'text-cyan-400',   bar: 'bg-cyan-400' },
}

function computeStats(logs: any[], ticketLogs: any[], totalCategories: number, totalTaskTypes: number, weekChallengeDone: boolean): MemberStats {
  const totalTasks = logs.length
  const totalPoints = logs.reduce((s: number, l: any) => s + (l.points_awarded || 0), 0)
  const days = new Set(logs.map((l: any) => new Date(l.done_at).toDateString()))
  let maxStreak = 0, cur = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * 86400000).toDateString()
    if (days.has(d)) { cur++; maxStreak = Math.max(maxStreak, cur) } else cur = 0
  }
  const uniqueCategories = new Set(logs.map((l: any) => l.task_type?.category).filter(Boolean)).size
  const uniqueTasksDone = new Set(logs.map((l: any) => l.task_type_id).filter(Boolean)).size
  return { totalTasks, totalPoints, maxStreak, uniqueCategories, totalCategories, ticketsCompleted: ticketLogs.length, uniqueTasksDone, totalTaskTypes, weekChallengeDone }
}

export default function SuccesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [])

  async function load(profileId: string, householdId: string) {
    const since7 = new Date(Date.now() - 7 * 86400000).toISOString()
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0)
    const weekNum = Math.max(0, Math.floor((weekStart.getTime() - new Date('2026-01-05T00:00:00.000Z').getTime()) / (7 * 86400000)))
    const mult = Math.pow(1.1, weekNum)

    const [{ data: members }, { data: allLogs }, { data: taskTypes }, { data: tickets }, { data: weekLogs }, { data: weekTickets }] = await Promise.all([
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_logs').select('done_by, done_at, points_awarded, task_type_id, task_type:task_types(category)').eq('household_id', householdId),
      supabase.from('task_types').select('id, category').eq('household_id', householdId),
      supabase.from('tickets').select('completed_by').eq('household_id', householdId).eq('status', 'done').not('completed_by', 'is', null),
      supabase.from('task_logs').select('done_by, done_at, points_awarded').eq('household_id', householdId).gte('done_at', since7),
      supabase.from('tickets').select('completed_by, points, completed_at').eq('household_id', householdId).eq('status', 'done').gte('completed_at', since7).not('completed_at', 'is', null),
    ])

    const wLogs = weekLogs ?? []
    const wTickets = (weekTickets ?? []).filter((t: any) => t.completed_by && (t.points ?? 0) > 0)
    const weekTotalTasks = wLogs.length + wTickets.length
    const weekTotalPts = wLogs.reduce((s: number, l: any) => s + l.points_awarded, 0) + wTickets.reduce((s: number, t: any) => s + (t.points ?? 0), 0)
    const totalMemberCount = (members ?? []).length
    const weekActiveProfiles = new Set([...wLogs.map((l: any) => l.done_by), ...wTickets.map((t: any) => t.completed_by)]).size
    const dayTaskCount: Record<string, number> = {}
    for (const l of wLogs) { const d = new Date(l.done_at).toDateString(); dayTaskCount[d] = (dayTaskCount[d] ?? 0) + 1 }
    const maxDayTasks = Math.max(0, ...Object.values(dayTaskCount))
    const weekChallengeDone = weekTotalTasks >= Math.round(50 * mult) || weekTotalPts >= Math.round(300 * mult) || (totalMemberCount > 0 && weekActiveProfiles >= totalMemberCount) || maxDayTasks >= Math.round(10 * mult)

    const cats = new Set((taskTypes ?? []).map((t: any) => t.category)).size
    const totalTaskTypes = (taskTypes ?? []).length
    const memberStats: Record<string, { profile: any; achieved: Set<string>; stats: MemberStats }> = {}

    for (const m of members ?? []) {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      if (!p) continue
      const myLogs = (allLogs ?? []).filter((l: any) => l.done_by === m.profile_id)
      const myTickets = (tickets ?? []).filter((t: any) => t.completed_by === m.profile_id)
      const stats = computeStats(myLogs, myTickets, cats, totalTaskTypes, weekChallengeDone)
      const achieved = new Set(ACHIEVEMENTS.filter(a => a.check(stats)).map(a => a.id))
      memberStats[m.profile_id] = { profile: p, achieved, stats }
    }

    setData({ memberStats, profileId })
    setLoading(false)
  }

  if (loading || !data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const myEntry = data.memberStats[data.profileId]
  const myAchieved: Set<string> = myEntry?.achieved ?? new Set()
  const myStats: MemberStats = myEntry?.stats ?? { totalTasks: 0, totalPoints: 0, maxStreak: 0, uniqueCategories: 0, totalCategories: 0, ticketsCompleted: 0, uniqueTasksDone: 0, totalTaskTypes: 0, weekChallengeDone: false }
  const others = Object.entries(data.memberStats as Record<string, any>).filter(([id]) => id !== data.profileId)
  const earned = ACHIEVEMENTS.filter(a => myAchieved.has(a.id))
  const locked = ACHIEVEMENTS.filter(a => !myAchieved.has(a.id))

  function AchievementCard({ a, unlocked }: { a: Achievement; unlocked: boolean }) {
    const s = TIER_STYLE[a.tier]
    const alsoHave = others.filter(([, v]: any) => v.achieved.has(a.id)).map(([, v]: any) => v.profile)
    const { current, total } = a.progress(myStats)
    const pct = Math.min(100, Math.round((current / total) * 100))

    return (
      <div className={unlocked
        ? `bg-gradient-to-br ${s.card} border rounded-xl px-4 py-3`
        : 'bg-[#1c1c26] border border-[#2e2e3e] rounded-xl px-4 py-3 opacity-50'
      }>
        <div className="flex items-center gap-4">
          <p className={`text-2xl flex-shrink-0 ${!unlocked ? 'grayscale' : ''}`}>{a.emoji}</p>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${unlocked ? s.label : 'text-[#555570]'}`}>{a.label}</p>
            <p className={`text-[11px] mt-0.5 ${unlocked ? 'text-[#7070a0]' : 'text-[#444458]'}`}>{a.desc}</p>
            {!unlocked && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1 bg-[#2e2e3e] rounded-full overflow-hidden">
                  <div className={`h-full ${s.bar} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] text-[#555570] flex-shrink-0">{current}/{total}</span>
              </div>
            )}
          </div>
          {alsoHave.length > 0 && (
            <div className="flex -space-x-1.5 flex-shrink-0">
              {alsoHave.map((p: any) => (
                <Avatar key={p.id} name={p.display_name} color={p.color} avatarUrl={p.avatar_url} size="xs" className="ring-1 ring-[#13131a]" />
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Succès</h2>
        <p className="text-xs text-[#7070a0]">{myAchieved.size} / {ACHIEVEMENTS.length}</p>
      </div>

      <div className="h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-700"
          style={{ width: `${(myAchieved.size / ACHIEVEMENTS.length) * 100}%` }}
        />
      </div>

      {earned.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mt-1">Obtenus</p>
          <div className="flex flex-col gap-2">
            {earned.map(a => <AchievementCard key={a.id} a={a} unlocked={true} />)}
          </div>
        </>
      )}

      {locked.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mt-1">À débloquer</p>
          <div className="flex flex-col gap-2">
            {locked.map(a => <AchievementCard key={a.id} a={a} unlocked={false} />)}
          </div>
        </>
      )}
    </div>
  )
}
