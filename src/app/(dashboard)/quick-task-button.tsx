'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import type { TaskType } from '@/types'

interface Props {
  taskTypes: TaskType[]
  householdId: string
  userId: string
}

export function QuickTaskButton({ taskTypes, householdId, userId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<{ label: string; points: number } | null>(null)
  const supabase = createClient()

  // Group by category
  const categories = taskTypes.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = []
    acc[t.category].push(t)
    return acc
  }, {} as Record<string, TaskType[]>)

  async function logTask(task: TaskType) {
    setLoading(task.id)
    const { error } = await supabase.from('task_logs').insert({
      household_id: householdId,
      task_type_id: task.id,
      done_by: userId,
      done_at: new Date().toISOString(),
      points_awarded: task.points,
    })
    if (!error) {
      setCelebration({ label: task.label, points: task.points })
      setOpen(false)
      setTimeout(() => { setCelebration(null); router.refresh() }, 2000)
    }
    setLoading(null)
  }

  return (
    <>
      {celebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-[#1a1a24] border border-green-500/30 rounded-2xl p-6 text-center animate-pop-in shadow-2xl">
            <div className="text-5xl mb-3">✅</div>
            <p className="text-lg font-bold text-[#f0f0f5]">{celebration.label}</p>
            <p className="text-3xl font-black text-green-400 mt-2">+{celebration.points} pts !</p>
          </div>
        </div>
      )}

      <Button
        size="lg"
        className="w-full gap-2"
        onClick={() => setOpen(true)}
      >
        ✅ J'ai fait une tâche !
      </Button>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 max-h-[80dvh] overflow-y-auto animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto mb-4" />
            <h3 className="text-base font-bold text-[#f0f0f5] mb-4">Quelle tâche as-tu faite ?</h3>
            {Object.entries(categories).map(([category, tasks]) => (
              <div key={category} className="mb-4">
                <p className="text-xs font-semibold text-[#555570] uppercase tracking-wider mb-2">{category}</p>
                <div className="flex flex-col gap-1">
                  {tasks.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => logTask(task)}
                      disabled={loading === task.id}
                      className="flex items-center justify-between w-full px-4 py-3 rounded-xl bg-[#22222e] hover:bg-[#2a2a3e] transition-colors text-left"
                    >
                      <span className="text-sm text-[#f0f0f5]">{task.label}</span>
                      <span className="text-xs font-bold text-green-400 ml-2">+{task.points}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
