'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { formatRelative } from '@/lib/utils'
import type { TaskType } from '@/types'
import { TaskActions } from './task-actions'

function SwipeableTaskCard({ task, doneToday, onDone }: {
  task: TaskType
  doneToday: boolean
  onDone: (task: TaskType) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const greenRef = useRef<HTMLDivElement>(null)
  const checkRef = useRef<HTMLSpanElement>(null)
  const startX = useRef<number | null>(null)
  const dx = useRef(0)
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone
  const THRESHOLD = 80

  useEffect(() => {
    if (doneToday) return
    const el = wrapRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      startX.current = e.touches[0].clientX
      dx.current = 0
      if (innerRef.current) innerRef.current.style.transition = 'none'
    }

    function onTouchMove(e: TouchEvent) {
      if (startX.current === null) return
      const delta = e.touches[0].clientX - startX.current
      if (delta > 8) e.preventDefault()
      if (delta > 0) {
        dx.current = Math.min(delta, 130)
        if (innerRef.current) innerRef.current.style.transform = `translateX(${dx.current}px)`
        const progress = Math.min(dx.current / THRESHOLD, 1)
        if (greenRef.current) greenRef.current.style.opacity = String(progress)
        if (checkRef.current) checkRef.current.style.transform = `scale(${0.6 + progress * 0.4})`
      }
    }

    function onTouchEnd() {
      if (dx.current >= THRESHOLD) onDoneRef.current(task)
      dx.current = 0
      if (innerRef.current) {
        innerRef.current.style.transition = 'transform 0.25s ease'
        innerRef.current.style.transform = 'translateX(0)'
      }
      if (greenRef.current) greenRef.current.style.opacity = '0'
      startX.current = null
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [task, doneToday])

  if (doneToday) {
    return (
      <Card>
        <div className="flex items-center justify-between opacity-50">
          <div>
            <p className="text-sm font-medium text-[#f0f0f5] line-through">{task.label}</p>
            <p className="text-xs text-[#8888a0] mt-0.5">{frequencyLabel(task.frequency)}</p>
          </div>
          <span className="text-green-500 font-bold text-lg">✓</span>
        </div>
      </Card>
    )
  }

  return (
    <div ref={wrapRef} className="relative overflow-hidden rounded-xl">
      <div ref={greenRef} className="absolute inset-0 flex items-center px-5 bg-green-500 rounded-xl opacity-0">
        <span ref={checkRef} className="text-white font-black text-xl" style={{ transform: 'scale(0.6)' }}>✓</span>
        <span className="text-white font-semibold text-sm ml-2">+{task.points} pts</span>
      </div>
      <div ref={innerRef}>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-[#f0f0f5]">{task.label}</p>
              <p className="text-xs text-[#8888a0] mt-0.5">{frequencyLabel(task.frequency)}</p>
            </div>
            <span className="text-sm font-bold text-green-400">+{task.points} pts</span>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default function TachesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [celebration, setCelebration] = useState<{ label: string; points: number; logId: string; taskId: string } | null>(null)
  const [doneTodayIds, setDoneTodayIds] = useState<Set<string>>(new Set())
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    load(session.profileId, session.householdId)
  }, [])

  async function load(profileId: string, householdId: string) {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [{ data: taskTypes }, { data: recentLogs }, { data: todayLogs }, { data: myProfile }] = await Promise.all([
      supabase.from('task_types').select('*').eq('household_id', householdId).order('category').order('label'),
      supabase.from('task_logs')
        .select('*, task_type:task_types(label, category, points), profile:profiles(display_name, color, avatar_url)')
        .eq('household_id', householdId)
        .order('done_at', { ascending: false })
        .limit(20),
      supabase.from('task_logs')
        .select('task_type_id')
        .eq('household_id', householdId)
        .eq('done_by', profileId)
        .gte('done_at', todayStart.toISOString()),
      supabase.from('profiles').select('display_name').eq('id', profileId).single(),
    ])

    const categories: Record<string, TaskType[]> = {}
    for (const t of (taskTypes ?? []) as TaskType[]) {
      if (!categories[t.category]) categories[t.category] = []
      categories[t.category].push(t)
    }

    const displayName = (myProfile as any)?.display_name ?? 'Quelqu\'un'
    setDoneTodayIds(new Set((todayLogs ?? []).map((l: any) => l.task_type_id)))
    setData({ taskTypes: taskTypes ?? [], recentLogs: recentLogs ?? [], categories, profileId, householdId, displayName })
    setLoading(false)
  }

  const logTask = useCallback(async (task: TaskType) => {
    if (!data || doneTodayIds.has(task.id)) return
    setDoneTodayIds(prev => new Set([...prev, task.id]))
    const { data: inserted, error } = await supabase.from('task_logs').insert({
      household_id: data.householdId,
      task_type_id: task.id,
      done_by: data.profileId,
      done_at: new Date().toISOString(),
      points_awarded: task.points,
    }).select('id').single()
    if (!error && inserted) {
      if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
      setCelebration({ label: task.label, points: task.points, logId: inserted.id, taskId: task.id })
      celebrationTimer.current = setTimeout(() => { setCelebration(null); router.refresh() }, 3000)
      // Notify other household members
      fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId: data.householdId, excludeProfileId: data.profileId, title: `✅ ${data.displayName} a fini`, body: `${task.label} · +${task.points} pts`, url: '/accueil' }) }).catch(() => {})
    } else {
      setDoneTodayIds(prev => { const s = new Set(prev); s.delete(task.id); return s })
    }
  }, [data, doneTodayIds])

  const undoTask = useCallback(async (logId: string, taskId: string) => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current)
    setCelebration(null)
    setDoneTodayIds(prev => { const s = new Set(prev); s.delete(taskId); return s })
    await fetch(`/api/task-logs/${logId}`, { method: 'DELETE' })
  }, [])

  const deleteLog = useCallback(async (logId: string, taskTypeId: string, doneBy: string, doneAt: string) => {
    const res = await fetch(`/api/task-logs/${logId}`, { method: 'DELETE' })
    if (!res.ok) { console.error('deleteLog failed', await res.text()); return }
    setData((prev: any) => {
      if (!prev) return prev
      return { ...prev, recentLogs: prev.recentLogs.filter((l: any) => l.id !== logId) }
    })
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    if (doneBy === data?.profileId && new Date(doneAt) >= todayStart) {
      setDoneTodayIds(prev => { const s = new Set(prev); s.delete(taskTypeId); return s })
    }
    router.refresh()
  }, [data?.profileId, router])

  if (loading || !data) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" /></div>

  const { taskTypes, recentLogs, categories, profileId, householdId } = data

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {celebration && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-[#1a1a24] border border-green-500/30 rounded-2xl p-6 text-center animate-pop-in shadow-2xl">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-lg font-bold text-[#f0f0f5]">{celebration.label}</p>
            <p className="text-3xl font-black text-green-400 mt-2">+{celebration.points} pts !</p>
            <button
              onClick={() => undoTask(celebration.logId, celebration.taskId)}
              className="mt-4 text-xs text-[#7070a0] underline underline-offset-2 hover:text-[#f0f0f5] transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>,
        document.body
      )}

      <TaskActions taskTypes={taskTypes} householdId={householdId} profileId={profileId} displayName={data.displayName} />

      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-sm font-semibold text-[#8888a0]">
            Tâches disponibles
            <span className="text-[#555570] font-normal ml-2 text-xs">← glisser pour valider</span>
          </h3>
          <a href="/historique" className="text-xs text-[#7070a0] hover:text-red-400 transition-colors">Historique →</a>
        </div>
        {Object.entries(categories).map(([category, tasks]: [string, any]) => (
          <div key={category} className="mb-4">
            <p className="text-xs font-semibold text-[#555570] uppercase tracking-wider mb-2 px-1">{category}</p>
            <div className="flex flex-col gap-2">
              {tasks.map((task: TaskType) => (
                <SwipeableTaskCard
                  key={task.id}
                  task={task}
                  doneToday={doneTodayIds.has(task.id)}
                  onDone={logTask}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {recentLogs.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-[#8888a0] mb-2 px-1">Historique</h3>
          <div className="flex flex-col gap-2">
            {recentLogs.map((log: any) => (
              <div key={log.id} className="flex items-center gap-3 px-1 py-1">
                {log.profile && <Avatar name={log.profile.display_name} color={log.profile.color} avatarUrl={log.profile.avatar_url} size="sm" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f0f0f5] truncate">{log.task_type?.label}</p>
                  <p className="text-xs text-[#8888a0]">{log.profile?.display_name} · {formatRelative(log.done_at)}</p>
                </div>
                <span className="text-xs font-bold text-green-400">+{log.points_awarded}</span>
                <button
                  onClick={() => deleteLog(log.id, log.task_type_id, log.done_by, log.done_at)}
                  className="ml-1 w-6 h-6 flex items-center justify-center rounded-lg text-[#7070a0] hover:text-red-400 active:text-red-400 hover:bg-red-500/10 active:bg-red-500/10 transition-all"
                  title="Supprimer"
                >✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function frequencyLabel(f: string): string {
  return { daily: 'Quotidien', weekly: 'Hebdo', monthly: 'Mensuel', as_needed: 'Selon besoin' }[f] ?? f
}
