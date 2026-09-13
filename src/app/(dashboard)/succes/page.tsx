'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'

interface Achievement {
  id: string
  emoji: string
  label: string
  desc: string
  tier: 'bronze' | 'silver' | 'gold' | 'diamond'
  check: (stats: MemberStats) => boolean
}

interface MemberStats {
  totalTasks: number
  totalPoints: number
  maxStreak: number
  uniqueCategories: number
  totalCategories: number
  ticketsCompleted: number
}

const ACHIEVEMENTS: Achievement[] = [
  // Tâches
  { id: 'first_task',   emoji: '🌱', label: 'Premier pas',      desc: '1 tâche complétée',      tier: 'bronze',  check: s => s.totalTasks >= 1 },
  { id: 'tasks_10',     emoji: '⚡', label: 'En route',         desc: '10 tâches complétées',   tier: 'bronze',  check: s => s.totalTasks >= 10 },
  { id: 'tasks_50',     emoji: '🔥', label: 'En feu',           desc: '50 tâches complétées',   tier: 'silver',  check: s => s.totalTasks >= 50 },
  { id: 'tasks_100',    emoji: '💪', label: 'Centurion',        desc: '100 tâches complétées',  tier: 'silver',  check: s => s.totalTasks >= 100 },
  { id: 'tasks_250',    emoji: '🏅', label: 'Bosseur',          desc: '250 tâches complétées',  tier: 'gold',    check: s => s.totalTasks >= 250 },
  { id: 'tasks_500',    emoji: '🏆', label: 'Légende',          desc: '500 tâches complétées',  tier: 'diamond', check: s => s.totalTasks >= 500 },
  // Points
  { id: 'pts_100',      emoji: '💰', label: 'Premiers euros',   desc: '100 pts gagnés',         tier: 'bronze',  check: s => s.totalPoints >= 100 },
  { id: 'pts_500',      emoji: '💎', label: 'Riche',            desc: '500 pts gagnés',         tier: 'silver',  check: s => s.totalPoints >= 500 },
  { id: 'pts_1000',     emoji: '👑', label: 'Millionnaire',     desc: '1 000 pts gagnés',       tier: 'gold',    check: s => s.totalPoints >= 1000 },
  { id: 'pts_5000',     emoji: '🌟', label: 'Intouchable',      desc: '5 000 pts gagnés',       tier: 'diamond', check: s => s.totalPoints >= 5000 },
  // Streak
  { id: 'streak_3',     emoji: '📅', label: 'Régulier',         desc: '3 jours de suite',       tier: 'bronze',  check: s => s.maxStreak >= 3 },
  { id: 'streak_7',     emoji: '🗓️', label: 'Semaine parfaite', desc: '7 jours de suite',       tier: 'silver',  check: s => s.maxStreak >= 7 },
  { id: 'streak_14',    emoji: '🌙', label: 'Deux semaines',    desc: '14 jours de suite',      tier: 'gold',    check: s => s.maxStreak >= 14 },
  { id: 'streak_30',    emoji: '🔮', label: 'Mois de feu',      desc: '30 jours de suite',      tier: 'diamond', check: s => s.maxStreak >= 30 },
  // Diversité
  { id: 'all_cats',     emoji: '🗂️', label: 'Touche-à-tout',   desc: 'Toutes les catégories',  tier: 'silver',  check: s => s.totalCategories > 0 && s.uniqueCategories >= s.totalCategories },
  // Tickets
  { id: 'ticket_1',     emoji: '🎫', label: 'Service rendu',    desc: '1 ticket complété',      tier: 'bronze',  check: s => s.ticketsCompleted >= 1 },
  { id: 'ticket_10',    emoji: '🛠️', label: 'Handyman',         desc: '10 tickets complétés',   tier: 'gold',    check: s => s.ticketsCompleted >= 10 },
]

const TIER_COLOR: Record<string, string> = {
  bronze:  'from-orange-900/40 to-orange-800/20 border-orange-700/30',
  silver:  'from-slate-700/40 to-slate-600/20 border-slate-500/30',
  gold:    'from-yellow-900/40 to-yellow-800/20 border-yellow-600/30',
  diamond: 'from-cyan-900/40 to-blue-900/20 border-cyan-500/30',
}

const TIER_LABEL_COLOR: Record<string, string> = {
  bronze:  'text-orange-400',
  silver:  'text-slate-300',
  gold:    'text-yellow-400',
  diamond: 'text-cyan-400',
}

function computeStats(logs: any[], ticketLogs: any[], totalCategories: number): MemberStats {
  const totalTasks = logs.length
  const totalPoints = logs.reduce((s: number, l: any) => s + (l.points_awarded || 0), 0)

  // Max streak
  const days = new Set(logs.map((l: any) => new Date(l.done_at).toDateString()))
  let maxStreak = 0, cur = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today.getTime() - i * 86400000).toDateString()
    if (days.has(d)) { cur++; maxStreak = Math.max(maxStreak, cur) } else cur = 0
  }

  // Categories
  const uniqueCategories = new Set(logs.map((l: any) => l.task_type?.category).filter(Boolean)).size

  return { totalTasks, totalPoints, maxStreak, uniqueCategories, totalCategories, ticketsCompleted: ticketLogs.length }
}

export default function SuccesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [])

  async function load(profileId: string, householdId: string) {
    const [{ data: members }, { data: allLogs }, { data: taskTypes }, { data: tickets }] = await Promise.all([
      supabase.from('household_members').select('profile_id, profile:profiles(id, display_name, color, avatar_url)').eq('household_id', householdId),
      supabase.from('task_logs').select('done_by, done_at, points_awarded, task_type:task_types(category)').eq('household_id', householdId),
      supabase.from('task_types').select('category').eq('household_id', householdId),
      supabase.from('tickets').select('completed_by').eq('household_id', householdId).eq('status', 'done').not('completed_by', 'is', null),
    ])

    const cats = new Set((taskTypes ?? []).map((t: any) => t.category)).size

    const memberStats: Record<string, { profile: any; stats: MemberStats; achievements: Achievement[] }> = {}
    for (const m of members ?? []) {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      if (!p) continue
      const myLogs = (allLogs ?? []).filter((l: any) => l.done_by === m.profile_id)
      const myTickets = (tickets ?? []).filter((t: any) => t.completed_by === m.profile_id)
      const stats = computeStats(myLogs, myTickets, cats)
      const earned = ACHIEVEMENTS.filter(a => a.check(stats))
      memberStats[m.profile_id] = { profile: p, stats, achievements: earned }
    }

    setData({ memberStats, profileId })
    setLoading(false)
  }

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  const entries = Object.entries(data.memberStats as Record<string, any>).sort(([, a]: any, [, b]: any) => b.achievements.length - a.achievements.length)

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Succès</h2>
        <p className="text-xs text-[#7070a0]">{ACHIEVEMENTS.length} badges au total</p>
      </div>

      {entries.map(([profileId, { profile, stats, achievements }]: any) => {
        const isMe = profileId === data.profileId
        const isSelected = selected === profileId
        const locked = ACHIEVEMENTS.filter(a => !achievements.find((e: any) => e.id === a.id))

        return (
          <Card key={profileId}>
            <button className="w-full text-left" onClick={() => setSelected(isSelected ? null : profileId)}>
              <div className="flex items-center gap-3 mb-3">
                <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="md" />
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#f0f0f8]">
                    {profile.display_name} {isMe && <span className="text-[#7070a0] font-normal text-xs">(moi)</span>}
                  </p>
                  <p className="text-xs text-[#7070a0]">{achievements.length} / {ACHIEVEMENTS.length} badges</p>
                </div>
                <div className="flex gap-1 flex-wrap justify-end max-w-[120px]">
                  {achievements.slice(0, 6).map((a: any) => (
                    <span key={a.id} className="text-base">{a.emoji}</span>
                  ))}
                  {achievements.length > 6 && <span className="text-xs text-[#7070a0] font-bold">+{achievements.length - 6}</span>}
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-[#2e2e3e] rounded-full overflow-hidden mb-1">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-700"
                  style={{ width: `${(achievements.length / ACHIEVEMENTS.length) * 100}%` }}
                />
              </div>
            </button>

            {isSelected && (
              <div className="mt-4 flex flex-col gap-2">
                <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-1">Obtenus</p>
                {achievements.length === 0 && <p className="text-xs text-[#555570]">Aucun badge encore — commence à faire des tâches !</p>}
                <div className="grid grid-cols-2 gap-2">
                  {achievements.map((a: any) => (
                    <div key={a.id} className={`bg-gradient-to-br ${TIER_COLOR[a.tier]} border rounded-xl p-3`}>
                      <p className="text-xl mb-1">{a.emoji}</p>
                      <p className={`text-xs font-bold ${TIER_LABEL_COLOR[a.tier]}`}>{a.label}</p>
                      <p className="text-[10px] text-[#7070a0] mt-0.5">{a.desc}</p>
                    </div>
                  ))}
                </div>

                {locked.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mt-2 mb-1">À débloquer</p>
                    <div className="grid grid-cols-2 gap-2">
                      {locked.map((a: any) => (
                        <div key={a.id} className="bg-[#1c1c26] border border-[#2e2e3e] rounded-xl p-3 opacity-50">
                          <p className="text-xl mb-1 grayscale">{a.emoji}</p>
                          <p className="text-xs font-bold text-[#555570]">{a.label}</p>
                          <p className="text-[10px] text-[#444458] mt-0.5">{a.desc}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
