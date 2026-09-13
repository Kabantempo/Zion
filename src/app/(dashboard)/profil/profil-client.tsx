'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { setProfileSession, getProfileSession } from '@/lib/profile-session'
import type { Profile, HouseholdMember } from '@/types'

function CropModal({ src, onConfirm, onCancel }: { src: string; onConfirm: (dataUrl: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [loaded, setLoaded] = useState(false)
  const offsetRef = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null)
  const lastPinchRef = useRef<number | null>(null)
  const SIZE = 280

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, SIZE, SIZE)

    const s = scaleRef.current
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y

    const fitScale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const drawW = img.naturalWidth * fitScale * s
    const drawH = img.naturalHeight * fitScale * s
    const baseX = (SIZE - drawW) / 2
    const baseY = (SIZE - drawH) / 2

    ctx.drawImage(img, baseX + ox, baseY + oy, drawW, drawH)

    // Circular clip overlay
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, SIZE, SIZE)
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2, true)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fill('evenodd')
    ctx.restore()
  }, [])

  useEffect(() => {
    const img = new Image()
    img.onload = () => { imgRef.current = img; setLoaded(true); draw() }
    img.src = src
  }, [src, draw])

  useEffect(() => {
    if (!loaded) return
    draw()
    const canvas = canvasRef.current!

    function onTouchStart(e: TouchEvent) {
      e.preventDefault()
      if (e.touches.length === 1) {
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        lastPinchRef.current = null
      } else if (e.touches.length === 2) {
        lastPinchRef.current = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        lastTouchRef.current = null
      }
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault()
      if (e.touches.length === 1 && lastTouchRef.current) {
        const dx = e.touches[0].clientX - lastTouchRef.current.x
        const dy = e.touches[0].clientY - lastTouchRef.current.y
        offsetRef.current = { x: offsetRef.current.x + dx, y: offsetRef.current.y + dy }
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        draw()
      } else if (e.touches.length === 2 && lastPinchRef.current !== null) {
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY)
        scaleRef.current = Math.max(0.5, Math.min(5, scaleRef.current * (dist / lastPinchRef.current)))
        lastPinchRef.current = dist
        draw()
      }
    }
    function onMouseDown(e: MouseEvent) {
      let last = { x: e.clientX, y: e.clientY }
      function onMove(ev: MouseEvent) {
        offsetRef.current = { x: offsetRef.current.x + ev.clientX - last.x, y: offsetRef.current.y + ev.clientY - last.y }
        last = { x: ev.clientX, y: ev.clientY }
        draw()
      }
      function onUp() { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      scaleRef.current = Math.max(0.5, Math.min(5, scaleRef.current * (1 - e.deltaY * 0.001)))
      draw()
    }

    canvas.addEventListener('touchstart', onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', onTouchMove, { passive: false })
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [loaded, draw])

  function confirm() {
    const canvas = canvasRef.current!
    const img = imgRef.current!
    const out = document.createElement('canvas')
    out.width = 256; out.height = 256
    const ctx = out.getContext('2d')!
    const s = scaleRef.current
    const ox = offsetRef.current.x
    const oy = offsetRef.current.y
    const fitScale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const drawW = img.naturalWidth * fitScale * s
    const drawH = img.naturalHeight * fitScale * s
    const baseX = (SIZE - drawW) / 2
    const baseY = (SIZE - drawH) / 2
    const ratio = 256 / SIZE
    ctx.drawImage(img, (baseX + ox) * ratio, (baseY + oy) * ratio, drawW * ratio, drawH * ratio)
    onConfirm(out.toDataURL('image/jpeg', 0.85))
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 p-4">
      <p className="text-white font-semibold mb-4 text-sm">Recadrer la photo</p>
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="rounded-full touch-none cursor-grab" style={{ width: SIZE, height: SIZE }} />
      <p className="text-[#8888a0] text-xs mt-3 mb-5">Glisse pour déplacer · pinch pour zoomer</p>
      <div className="flex gap-3">
        <button onClick={onCancel} className="px-5 py-2.5 rounded-xl bg-[#2e2e3e] text-[#f0f0f5] text-sm font-medium">Annuler</button>
        <button onClick={confirm} className="px-5 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold">Valider</button>
      </div>
    </div>,
    document.body
  )
}

function NotificationToggle({ profileId, householdId }: { profileId: string; householdId: string }) {
  const [status, setStatus] = useState<'loading' | 'unsupported' | 'denied' | 'off' | 'on'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { setStatus('unsupported'); return }
    const perm = Notification.permission
    if (perm === 'denied') { setStatus('denied'); return }
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription()
      setStatus(sub ? 'on' : 'off')
    })
  }, [])

  async function enable() {
    setBusy(true)
    try {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { setStatus('denied'); return }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      })
      await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), profileId, householdId }) })
      setStatus('on')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) await sub.unsubscribe()
      await fetch('/api/push/subscribe', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId, householdId }) })
      setStatus('off')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'unsupported') return null

  async function testNotif() {
    setBusy(true)
    const res = await fetch('/api/push/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ householdId, excludeProfileId: '', title: '🔔 Test notif', body: 'Ça marche !', url: '/profil' }) })
    const data = await res.json()
    alert(`Résultat: ${JSON.stringify(data)}`)
    setBusy(false)
  }

  return (
    <>
      <Card>
        <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Notifications</h3>
        {status === 'denied' ? (
          <p className="text-xs text-[#555570]">Notifications bloquées dans les paramètres du navigateur.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#f0f0f8]">Alertes push</p>
                <p className="text-xs text-[#7070a0] mt-0.5">
                  {status === 'on' ? 'Activées' : 'Reçois une alerte quand tes colocs agissent'}
                </p>
              </div>
              <button
                onClick={status === 'on' ? disable : enable}
                disabled={busy || status === 'loading'}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${status === 'on' ? 'bg-red-500' : 'bg-[#2e2e3e]'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${status === 'on' ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
            {status === 'on' && (
              <button onClick={testNotif} disabled={busy} className="text-xs text-[#7070a0] hover:text-red-400 transition-colors text-left">
                Tester la notification →
              </button>
            )}
          </div>
        )}
      </Card>

      <Card>
        <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Application</h3>
        <button
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations()
              for (const reg of regs) await reg.unregister()
            }
            const keys = await caches.keys()
            await Promise.all(keys.map(k => caches.delete(k)))
            window.location.reload()
          }}
          className="text-xs text-[#7070a0] hover:text-red-400 transition-colors text-left"
        >
          Vider le cache et recharger →
        </button>
      </Card>
    </>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

interface Props {
  profile: Profile
  household: { id: string; name: string; invite_code: string } | null
  members: HouseholdMember[]
  profileId: string
  isAdmin: boolean
}

export function ProfilClient({ profile, household, members, profileId, isAdmin }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [color] = useState(profile.color)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url ?? null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [cropSrc, setCropSrc] = useState<string | null>(null)

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarFile(file)
    setCropSrc(URL.createObjectURL(file))
  }

  function handleCropConfirm(dataUrl: string) {
    setAvatarPreview(dataUrl)
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setAvatarFile(null)
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setUploadError(null)

    const avatarUrl = avatarFile ? (avatarPreview ?? profile.avatar_url ?? null) : (profile.avatar_url ?? null)

    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim(), color, avatar_url: avatarUrl }).eq('id', profileId)

    if (error) {
      setUploadError('Erreur : ' + error.message)
      setLoading(false)
      return
    }

    const s = getProfileSession()
    if (s) setProfileSession({ ...s, displayName: displayName.trim(), color, avatarUrl })

    setSaved(true)
    setLoading(false)
    setTimeout(() => { setSaved(false); router.refresh() }, 1500)
  }

  async function logout() {
    localStorage.removeItem('zion_profile')
    try { await supabase.auth.signOut() } catch {}
    window.location.href = '/profiles'
  }

  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      {cropSrc && <CropModal src={cropSrc} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />}

      {/* Profile edit */}
      <form onSubmit={saveProfile}>
        <Card>
          {/* Avatar with upload */}
          <div className="flex justify-center mb-5">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative group">
              <div
                className="w-24 h-24 rounded-full overflow-hidden flex items-center justify-center text-2xl font-black text-white shadow-xl transition-opacity group-hover:opacity-80"
                style={{ backgroundColor: avatarPreview ? 'transparent' : color }}
              >
                {avatarPreview
                  ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                  : displayName.slice(0, 2).toUpperCase()
                }
              </div>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm border-2 border-[#09090d] shadow-md">
                📷
              </div>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <Input label="Prénom / Pseudo" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
            <Button type="submit" loading={loading}>
              {saved ? '✓ Sauvegardé !' : 'Sauvegarder'}
            </Button>
          </div>
        </Card>
      </form>

      {/* Household info */}
      {household && (
        <Card>
          <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Ma colocation</h3>
          <p className="text-lg font-bold text-[#f0f0f8] mb-4">{household.name}</p>
          <h4 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-2">Membres ({members.length})</h4>
          <div className="flex flex-col gap-2">
            {members.map((m) => {
              const p = m.profile as Profile | undefined
              if (!p) return null
              return (
                <div key={m.profile_id} className="flex items-center gap-3">
                  <Avatar name={p.display_name} color={p.color} avatarUrl={p.avatar_url} size="sm" />
                  <span className="text-sm text-[#f0f0f8] flex-1">{p.display_name}</span>
                  {m.role === 'admin' && <Badge variant="info">Admin</Badge>}
                  {m.profile_id === profileId && <Badge variant="default">Moi</Badge>}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* Notifications */}
      {household && <NotificationToggle profileId={profileId} householdId={household.id} />}

      {/* Cache */}
      <Card>
        <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Application</h3>
        <button
          onClick={async () => {
            if ('serviceWorker' in navigator) {
              const regs = await navigator.serviceWorker.getRegistrations()
              for (const reg of regs) await reg.unregister()
            }
            const keys = await caches.keys()
            await Promise.all(keys.map(k => caches.delete(k)))
            window.location.reload()
          }}
          className="text-xs text-[#7070a0] hover:text-red-400 transition-colors text-left"
        >
          Vider le cache et recharger →
        </button>
      </Card>

      {/* Logout */}
      <Card>
        <h3 className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest mb-3">Compte</h3>
        <Button variant="danger" className="w-full" onClick={logout}>
          Déconnexion
        </Button>
      </Card>
    </div>
  )
}
