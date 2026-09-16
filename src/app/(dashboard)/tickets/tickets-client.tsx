'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar } from '@/components/ui/avatar'
import type { Ticket, Profile } from '@/types'

const STATUS_LABELS: Record<string, string> = { todo: 'À faire', in_progress: 'En cours', done: 'Fait ✓' }
const STATUS_BADGE: Record<string, 'default' | 'warning' | 'success'> = { todo: 'default', in_progress: 'warning', done: 'success' }
const COLUMNS: Array<{ status: Ticket['status']; label: string }> = [
  { status: 'todo', label: 'À faire' },
  { status: 'in_progress', label: 'En cours' },
  { status: 'done', label: 'Fait' },
]

interface Props {
  tickets: Ticket[]
  profiles: Profile[]
  taskTypes: { id: string; label: string }[]
  householdId: string
  profileId: string
  displayName: string
}

export function TicketsClient({ tickets: initialTickets, profiles, taskTypes, householdId, profileId, displayName }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tickets, setTickets] = useState(initialTickets)
  const [showCreate, setShowCreate] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editTicket, setEditTicket] = useState<Ticket | null>(null)
  const [detailTicket, setDetailTicket] = useState<Ticket | null>(null)
  const [completeTicket, setCompleteTicket] = useState<Ticket | null>(null)
  const [completeNote, setCompleteNote] = useState('')

  // Create form state
  const [title, setTitle] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [note, setNote] = useState('')
  const [points, setPoints] = useState('10')

  // Edit form state
  const [editTitle, setEditTitle] = useState('')
  const [editAssignedTo, setEditAssignedTo] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editPoints, setEditPoints] = useState('0')

  const displayTickets = filter === 'mine' ? tickets.filter((t) => t.assigned_to === profileId) : tickets

  async function createTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading('create')
    const { data, error } = await supabase.from('tickets').insert({
      household_id: householdId,
      title: title.trim(),
      assigned_to: assignedTo || null,
      note: note || null,
      status: 'todo',
      created_by: profileId,
      points: parseInt(points) || 0,
    }).select('*, assignee:profiles!assigned_to(id, display_name, color, avatar_url)').single()

    if (!error && data) {
      setTickets((prev) => [data as Ticket, ...prev])
      setTitle(''); setAssignedTo(''); setNote(''); setPoints('10'); setShowCreate(false)
      // Notify assigned person if not self
      if (assignedTo && assignedTo !== profileId) {
        fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId, excludeProfileId: profileId, title: '🎫 Ticket assigné', body: title.trim(), url: '/tickets' }) }).catch(() => {})
      }
    }
    setLoading(null)
  }

  async function deleteTicket(ticketId: string) {
    setLoading(ticketId)
    const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
    if (res.ok) setTickets((prev) => prev.filter((t) => t.id !== ticketId))
    setConfirmDelete(null)
    setLoading(null)
  }

  function openEdit(ticket: Ticket) {
    setEditTicket(ticket)
    setEditTitle(ticket.title)
    setEditAssignedTo(ticket.assigned_to ?? '')
    setEditNote(ticket.note ?? '')
    setEditPoints(String(ticket.points ?? 0))
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editTicket) return
    setLoading('edit')
    const update = { title: editTitle.trim(), assigned_to: editAssignedTo || null, note: editNote || null, points: parseInt(editPoints) || 0 }
    const { error } = await supabase.from('tickets').update(update).eq('id', editTicket.id)
    if (!error) {
      setTickets((prev) => prev.map((t) => t.id === editTicket.id ? { ...t, ...update } : t))
      setEditTicket(null)
    }
    setLoading(null)
  }

  async function moveTicket(ticket: Ticket, newStatus: Ticket['status'], note?: string) {
    setLoading(ticket.id)
    const update: Partial<Ticket> = { status: newStatus }
    if (newStatus === 'done') {
      update.completed_by = profileId
      update.completed_at = new Date().toISOString()
    } else {
      update.completed_by = null
      update.completed_at = null
    }
    const { error } = await supabase.from('tickets').update(update).eq('id', ticket.id)
    if (!error) {
      // Save note separately so a missing column never blocks the completion
      if (newStatus === 'done' && note !== undefined) {
        supabase.from('tickets').update({ completed_note: note || null }).eq('id', ticket.id).then(() => {})
      }
      setTickets((prev) => prev.map((t) => t.id === ticket.id ? { ...t, ...update, ...(newStatus === 'done' && note !== undefined ? { completed_note: note || null } : {}) } : t))
      if (newStatus === 'done') {
        if (ticket.points > 0) fetch('/api/tickets/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId, profileId, points: ticket.points, label: ticket.title }) }).catch(() => {})
        fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId, excludeProfileId: profileId, title: `✅ ${displayName} a terminé`, body: `"${ticket.title}"`, url: '/tickets' }) }).catch(() => {})
      } else if (newStatus === 'in_progress') {
        fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId, excludeProfileId: profileId, title: `🔧 ${displayName} a commencé`, body: `"${ticket.title}"`, url: '/tickets' }) }).catch(() => {})
      }
    }
    setLoading(null)
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <div className="flex items-center gap-2">
        <div className="flex p-1 bg-[#1a1a24] rounded-xl border border-[#2e2e3e] flex-1">
          {(['all', 'mine'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${filter === f ? 'bg-red-500 text-white' : 'text-[#8888a0]'}`}>
              {f === 'all' ? 'Tous' : 'Les miens'}
            </button>
          ))}
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Ticket</Button>
      </div>

      {COLUMNS.map(({ status, label }) => {
        const col = displayTickets.filter((t) => t.status === status)
        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <h3 className="text-sm font-semibold text-[#8888a0]">{label}</h3>
              <span className="text-xs bg-[#2e2e3e] text-[#8888a0] px-2 py-0.5 rounded-full">{col.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {col.map((ticket) => (
                <Card key={ticket.id}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <button className="flex-1 min-w-0 text-left" onClick={() => setDetailTicket(ticket)}>
                      <p className="text-sm font-medium text-[#f0f0f5]">{ticket.title}</p>
                      {ticket.points > 0 && <p className="text-xs font-bold text-yellow-400 mt-0.5">+{ticket.points} pts</p>}
                    </button>
                    <Badge variant={STATUS_BADGE[ticket.status]}>{STATUS_LABELS[ticket.status]}</Badge>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(ticket)} className="w-6 h-6 flex items-center justify-center rounded-lg text-[#7070a0] hover:text-blue-400 hover:bg-blue-500/10 transition-all text-xs">✏️</button>
                      {confirmDelete === ticket.id ? (
                        <>
                          <button onClick={() => deleteTicket(ticket.id)} className="text-xs text-red-400 font-semibold px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20">Oui</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-[#7070a0] px-2 py-1 rounded-lg hover:bg-[#2e2e3e]">Non</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDelete(ticket.id)} className="w-6 h-6 flex items-center justify-center rounded-lg text-[#7070a0] hover:text-red-400 hover:bg-red-500/10 transition-all">✕</button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    {ticket.assignee && (
                      <div className="flex items-center gap-1.5">
                        <Avatar name={(ticket.assignee as Profile).display_name} color={(ticket.assignee as Profile).color} avatarUrl={(ticket.assignee as Profile).avatar_url} size="xs" />
                        <span className="text-xs text-[#8888a0]">{(ticket.assignee as Profile).display_name}</span>
                      </div>
                    )}
                    {ticket.creator && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[#555570]">par</span>
                        <Avatar name={(ticket.creator as Profile).display_name} color={(ticket.creator as Profile).color} avatarUrl={(ticket.creator as Profile).avatar_url} size="xs" />
                        <span className="text-xs text-[#555570]">{(ticket.creator as Profile).display_name}</span>
                      </div>
                    )}
                  </div>
                  {ticket.note && <p className="text-xs text-[#555570] mb-2 italic">{ticket.note}</p>}
                  <div className="flex gap-2 mt-1">
                    {status === 'in_progress' && (
                      <Button size="sm" variant="secondary" loading={loading === ticket.id} onClick={() => moveTicket(ticket, 'todo')}>
                        ← Retour
                      </Button>
                    )}
                    {status === 'done' && (
                      <Button size="sm" variant="secondary" loading={loading === ticket.id} onClick={() => moveTicket(ticket, 'in_progress')}>
                        ← Rouvrir
                      </Button>
                    )}
                    {status === 'todo' && (
                      <Button size="sm" variant="secondary" className="flex-1" loading={loading === ticket.id} onClick={() => moveTicket(ticket, 'in_progress')}>
                        Commencer →
                      </Button>
                    )}
                    {status === 'in_progress' && (
                      <Button size="sm" className="flex-1" loading={loading === ticket.id} onClick={() => { setCompleteTicket(ticket); setCompleteNote('') }}>
                        Marquer fait ✓
                      </Button>
                    )}
                    {status === 'todo' && !ticket.assigned_to && (
                      <Button size="sm" variant="secondary" loading={loading === ticket.id} onClick={() => {
                        setLoading(ticket.id)
                        supabase.from('tickets').update({ assigned_to: profileId }).eq('id', ticket.id)
                          .then(() => { setTickets((p) => p.map((t) => t.id === ticket.id ? { ...t, assigned_to: profileId } : t)); setLoading(null) })
                      }}>
                        Prendre
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
              {col.length === 0 && (
                <p className="text-xs text-[#555570] text-center py-4">Aucun ticket</p>
              )}
            </div>
          </div>
        )
      })}

      {/* Detail sheet */}
      {detailTicket && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setDetailTicket(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-5 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-bold text-[#f0f0f5] flex-1">{detailTicket.title}</h3>
              <Badge variant={STATUS_BADGE[detailTicket.status]}>{STATUS_LABELS[detailTicket.status]}</Badge>
            </div>
            {detailTicket.note && (
              <div className="bg-[#13131a] border border-[#2e2e3e] rounded-xl p-3">
                <p className="text-xs text-[#7070a0] mb-1">Note</p>
                <p className="text-sm text-[#d0d0e0]">{detailTicket.note}</p>
              </div>
            )}
            <div className="flex flex-col gap-2.5">
              {detailTicket.creator && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#555570] w-20 flex-shrink-0">Créé par</span>
                  <Avatar name={(detailTicket.creator as Profile).display_name} color={(detailTicket.creator as Profile).color} avatarUrl={(detailTicket.creator as Profile).avatar_url} size="sm" />
                  <span className="text-sm text-[#f0f0f5]">{(detailTicket.creator as Profile).display_name}</span>
                </div>
              )}
              {detailTicket.assignee && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#555570] w-20 flex-shrink-0">Assigné à</span>
                  <Avatar name={(detailTicket.assignee as Profile).display_name} color={(detailTicket.assignee as Profile).color} avatarUrl={(detailTicket.assignee as Profile).avatar_url} size="sm" />
                  <span className="text-sm text-[#f0f0f5]">{(detailTicket.assignee as Profile).display_name}</span>
                </div>
              )}
              {detailTicket.points > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#555570] w-20 flex-shrink-0">Points</span>
                  <span className="text-sm font-bold text-yellow-400">+{detailTicket.points} pts</span>
                </div>
              )}
              {detailTicket.completed_by && detailTicket.completed_at && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#555570] w-20 flex-shrink-0">Terminé le</span>
                  <span className="text-sm text-green-400">{new Date(detailTicket.completed_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
                </div>
              )}
            </div>
            {detailTicket.completed_note && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                <p className="text-xs text-green-400 mb-1">Message de complétion</p>
                <p className="text-sm text-[#d0d0e0]">{detailTicket.completed_note}</p>
              </div>
            )}
            <button onClick={() => setDetailTicket(null)} className="mt-1 text-sm text-[#7070a0] text-center py-2">Fermer</button>
          </div>
        </div>
      )}

      {/* Edit sheet */}
      {editTicket && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setEditTicket(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <form className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">Modifier le ticket</h3>
            <Input label="Titre" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Assigner à</p>
              <select value={editAssignedTo} onChange={(e) => setEditAssignedTo(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#22222e] border border-[#2e2e3e] text-[#f0f0f5] outline-none focus:border-red-500">
                <option value="">Personne (à prendre)</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
            <Input label="Note (optionnel)" value={editNote} onChange={(e) => setEditNote(e.target.value)} />
            <Input label="Points à attribuer" type="number" min="0" max="500" value={editPoints} onChange={(e) => setEditPoints(e.target.value)} />
            <Button type="submit" loading={loading === 'edit'} className="w-full">Sauvegarder</Button>
          </form>
        </div>
      )}

      {/* Complete note sheet */}
      {completeTicket && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setCompleteTicket(null)}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-5 flex flex-col gap-4 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <div>
              <h3 className="text-base font-bold text-[#f0f0f5] mb-0.5">Marquer comme fait</h3>
              <p className="text-xs text-[#7070a0]">{completeTicket.title}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Laisser un message (optionnel)</p>
              <textarea
                value={completeNote}
                onChange={(e) => setCompleteNote(e.target.value)}
                placeholder="Ex: C'est fait, j'ai aussi changé la pile..."
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-[#22222e] border border-[#2e2e3e] text-[#f0f0f5] outline-none focus:border-green-500 resize-none text-sm placeholder:text-[#555570]"
              />
            </div>
            <Button
              loading={loading === completeTicket.id}
              className="w-full !bg-green-600 hover:!bg-green-500"
              onClick={async () => {
                const t = completeTicket
                setCompleteTicket(null)
                await moveTicket(t, 'done', completeNote)
              }}
            >
              Confirmer ✓
            </Button>
            <button onClick={() => setCompleteTicket(null)} className="text-sm text-[#7070a0] text-center pb-1">Annuler</button>
          </div>
        </div>
      )}

      {/* Create sheet */}
      {showCreate && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end" onClick={() => setShowCreate(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <form className="relative bg-[#1a1a24] rounded-t-3xl border-t border-[#2e2e3e] p-4 flex flex-col gap-4 max-h-[80dvh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()} onSubmit={createTicket}>
            <div className="w-10 h-1 bg-[#2e2e3e] rounded-full mx-auto" />
            <h3 className="text-base font-bold text-[#f0f0f5]">Nouveau ticket</h3>
            <Input label="Titre" placeholder="Changer l'ampoule du salon" value={title} onChange={(e) => setTitle(e.target.value)} required />
            <div>
              <p className="text-sm font-medium text-[#8888a0] mb-1.5">Assigner à</p>
              <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-full px-4 py-3 rounded-xl bg-[#22222e] border border-[#2e2e3e] text-[#f0f0f5] outline-none focus:border-red-500">
                <option value="">Personne (à prendre)</option>
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
            <Input label="Note (optionnel)" placeholder="Plus d'infos..." value={note} onChange={(e) => setNote(e.target.value)} />
            <Input label="Points à attribuer" type="number" min="0" max="500" value={points} onChange={(e) => setPoints(e.target.value)} />
            <Button type="submit" loading={loading === 'create'} className="w-full">Créer le ticket</Button>
          </form>
        </div>
      )}
    </div>
  )
}
