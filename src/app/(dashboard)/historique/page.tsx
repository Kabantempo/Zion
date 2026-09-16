'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'

interface LogEntry {
  id: string
  done_by: string
  done_at: string
  points_awarded: number
  label: string
  category: string
  isTicket?: boolean
}

interface Profile {
  id: string
  display_name: string
  color: string
  avatar_url: string | null
}

export default function HistoriquePage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<{ logs: LogEntry[]; profiles: Record<string, Profile>; myId: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [])

  async function load(profileId: string, householdId: string) {
    const [{ data: logs }, { data: tickets }, { data: members }] = await Promise.all([
      supabase.from('task_logs')
        .select('id, done_by, done_at, points_awarded, task_type:task_types(label, category)')
        .eq('household_id', householdId)
        .order('done_at', { ascending: false })
        .limit(300),
      supabase.from('tickets')
        .select('id, completed_by, completed_at, points, title')
        .eq('household_id', householdId)
        .eq('status', 'done')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(100),
      supabase.from('household_members')
        .select('profile_id, profile:profiles(id, display_name, color, avatar_url)')
        .eq('household_id', householdId),
    ])

    const profiles: Record<string, Profile> = {}
    for (const m of members ?? []) {
      const p = Array.isArray(m.profile) ? m.profile[0] : m.profile
      if (p) profiles[m.profile_id] = p
    }

    const taskEntries: LogEntry[] = (logs ?? []).map((l: any) => {
      const tt = Array.isArray(l.task_type) ? l.task_type[0] : l.task_type
      return {
        id: l.id,
        done_by: l.done_by,
        done_at: l.done_at,
        points_awarded: l.points_awarded ?? 0,
        label: tt?.label ?? '?',
        category: tt?.category ?? '',
      }
    })

    const ticketEntries: LogEntry[] = (tickets ?? [])
      .filter((t: any) => t.completed_by && t.completed_at)
      .map((t: any) => ({
        id: `ticket-${t.id}`,
        done_by: t.completed_by,
        done_at: t.completed_at,
        points_awarded: t.points ?? 0,
        label: t.title,
        category: 'Tickets',
        isTicket: true,
      }))

    const allEntries = [...taskEntries, ...ticketEntries]
      .sort((a, b) => new Date(b.done_at).getTime() - new Date(a.done_at).getTime())

    setData({ logs: allEntries, profiles, myId: profileId })
    setLoading(false)
  }

  if (loading || !data) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const { logs, profiles, myId } = data

  // Group by day
  const grouped: { dateLabel: string; entries: LogEntry[] }[] = []
  const seen = new Map<string, LogEntry[]>()

  for (const log of logs) {
    const d = new Date(log.done_at)
    const key = d.toDateString()
    if (!seen.has(key)) seen.set(key, [])
    seen.get(key)!.push(log)
  }

  const today = new Date().toDateString()
  const yesterday = new Date(Date.now() - 86400000).toDateString()

  for (const [key, entries] of seen) {
    let dateLabel: string
    if (key === today) dateLabel = "Aujourd'hui"
    else if (key === yesterday) dateLabel = 'Hier'
    else {
      const d = new Date(key)
      dateLabel = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
      dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)
    }
    grouped.push({ dateLabel, entries })
  }

  return (
    <div className="p-4 flex flex-col gap-5 animate-slide-up">
      <h2 className="text-lg font-black text-[#f0f0f8]">Historique</h2>

      {grouped.length === 0 && (
        <p className="text-sm text-[#555570] text-center mt-8">Aucune tâche encore — commencez !</p>
      )}

      {grouped.map(({ dateLabel, entries }) => (
        <div key={dateLabel}>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-2">{dateLabel}</p>
          <div className="flex flex-col gap-2">
            {entries.map(log => {
              const profile = profiles[log.done_by]
              const time = new Date(log.done_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
              const isMe = log.done_by === myId
              return (
                <div key={log.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${isMe ? 'bg-red-500/10 border-red-500/20' : 'bg-[#13131a] border-[#252535]'}`}>
                  {profile && (
                    <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="sm" className="flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {log.isTicket && <span className="text-[10px] bg-[#2e2e3e] text-[#7070a0] px-1.5 py-0.5 rounded-md flex-shrink-0">🎫</span>}
                      <p className="text-sm font-medium text-[#f0f0f8] truncate">{log.label}</p>
                    </div>
                    <p className="text-[11px] text-[#7070a0] mt-0.5">
                      {profile?.display_name ?? '?'}{isMe ? ' (moi)' : ''} · {time}
                    </p>
                  </div>
                  {log.points_awarded > 0 && (
                    <span className="text-xs font-bold text-yellow-400 flex-shrink-0">+{log.points_awarded}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
