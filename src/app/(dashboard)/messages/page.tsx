'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'
import { getOrCreateKeyPair, encryptMessage, decryptMessage } from '@/lib/crypto'
import type { Profile } from '@/types'

interface RawMessage {
  id: string
  from_profile_id: string
  encrypted_content: string
  created_at: string
}

interface Message extends RawMessage {
  plain: string
}

export default function MessagesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [myProfileId, setMyProfileId] = useState('')
  const [householdId, setHouseholdId] = useState('')
  const [members, setMembers] = useState<Profile[]>([])
  const [activeProfile, setActiveProfile] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [theirKeyMissing, setTheirKeyMissing] = useState(false)
  const keyPairRef = useRef<CryptoKeyPair | null>(null)
  const theirKeyRef = useRef<JsonWebKey | null>(null)
  const lastMsgIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const myProfileIdRef = useRef('')
  const activeProfileRef = useRef<Profile | null>(null)

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    setMyProfileId(session.profileId)
    myProfileIdRef.current = session.profileId
    setHouseholdId(session.householdId)
    init(session.profileId, session.householdId)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function init(profileId: string, householdId: string) {
    const { keyPair, publicKeyJwk } = await getOrCreateKeyPair(profileId)
    keyPairRef.current = keyPair

    // Register public key
    await fetch('/api/messages/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, publicKeyJwk }),
    })

    // Load members
    const { data } = await supabase.from('household_members')
      .select('profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId)

    const profiles: Profile[] = (data ?? [])
      .map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile)
      .filter((p: any) => p && p.id !== profileId)

    setMembers(profiles)
    setLoading(false)
  }

  const decryptMsg = useCallback(async (msg: RawMessage, theirKey: JsonWebKey): Promise<Message> => {
    if (!keyPairRef.current) return { ...msg, plain: '🔒' }
    try {
      const plain = await decryptMessage(msg.encrypted_content, keyPairRef.current.privateKey, theirKey)
      return { ...msg, plain }
    } catch {
      return { ...msg, plain: '🔒 (clé invalide)' }
    }
  }, [])

  async function openChat(profile: Profile) {
    if (pollRef.current) clearInterval(pollRef.current)
    setActiveProfile(profile)
    activeProfileRef.current = profile
    setMessages([])
    setTheirKeyMissing(false)
    lastMsgIdRef.current = null

    // Load their public key
    const res = await fetch(`/api/messages/keys?profileId=${profile.id}`)
    const keyRow = await res.json()
    if (!keyRow?.public_key_jwk) {
      theirKeyRef.current = null
      setTheirKeyMissing(true)
    } else {
      theirKeyRef.current = JSON.parse(keyRow.public_key_jwk)
      setTheirKeyMissing(false)
    }

    await loadMessages(profile.id)

    // Poll for new messages every 3s
    pollRef.current = setInterval(() => pollMessages(profile.id), 3000)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  async function loadMessages(otherProfileId: string) {
    const myId = myProfileIdRef.current
    const res = await fetch(`/api/messages?from=${myId}&to=${otherProfileId}`)
    const msgs: RawMessage[] = await res.json()
    if (!Array.isArray(msgs)) return

    const theirKey = theirKeyRef.current
    if (!theirKey) { setMessages(msgs.map(m => ({ ...m, plain: '🔒' }))); return }

    const decrypted = await Promise.all(msgs.map(m => decryptMsg(m, theirKey)))
    setMessages(decrypted)
    if (decrypted.length > 0) lastMsgIdRef.current = decrypted[decrypted.length - 1].id
  }

  async function pollMessages(otherProfileId: string) {
    const myId = myProfileIdRef.current
    const res = await fetch(`/api/messages?from=${myId}&to=${otherProfileId}`)
    const msgs: RawMessage[] = await res.json()
    if (!Array.isArray(msgs) || msgs.length === 0) return

    const lastId = lastMsgIdRef.current
    const newMsgs = lastId ? msgs.filter(m => {
      const idx = msgs.findIndex(x => x.id === lastId)
      return idx >= 0 ? msgs.indexOf(m) > idx : true
    }) : msgs

    if (newMsgs.length === 0) return

    const theirKey = theirKeyRef.current
    const decrypted = theirKey
      ? await Promise.all(newMsgs.map(m => decryptMsg(m, theirKey)))
      : newMsgs.map(m => ({ ...m, plain: '🔒' }))

    setMessages(prev => [...prev, ...decrypted])
    lastMsgIdRef.current = decrypted[decrypted.length - 1].id
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !activeProfile || !keyPairRef.current || !theirKeyRef.current) return
    setSending(true)
    try {
      const encrypted = await encryptMessage(text.trim(), keyPairRef.current.privateKey, theirKeyRef.current)
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdId,
          fromProfileId: myProfileId,
          toProfileId: activeProfile.id,
          encryptedContent: encrypted,
        }),
      })
      if (res.ok) {
        const msg: RawMessage = await res.json()
        const plain = text.trim()
        setMessages(prev => [...prev, { ...msg, plain }])
        lastMsgIdRef.current = msg.id
        setText('')
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } catch (err) {
      console.error('send error', err)
    }
    setSending(false)
  }

  function back() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setActiveProfile(null)
    activeProfileRef.current = null
    setMessages([])
    theirKeyRef.current = null
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Chat view ──
  if (activeProfile) {
    const canSend = !!theirKeyRef.current

    return (
      <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#252535] flex-shrink-0">
          <button onClick={back} className="text-[#7070a0] hover:text-[#f0f0f8] transition-colors text-sm mr-1">←</button>
          <Avatar name={activeProfile.display_name} color={activeProfile.color} avatarUrl={activeProfile.avatar_url} size="sm" />
          <div>
            <p className="text-sm font-bold text-[#f0f0f8]">{activeProfile.display_name}</p>
            <p className="text-[10px] text-green-400">🔒 Chiffré bout en bout</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <p className="text-4xl">💬</p>
              <p className="text-sm text-[#7070a0]">Début de la conversation</p>
              {theirKeyMissing && (
                <p className="text-xs text-yellow-400 mt-1 max-w-[240px]">
                  ⚠️ {activeProfile.display_name} doit ouvrir la page Messages une fois pour activer le chiffrement.
                </p>
              )}
            </div>
          )}
          {messages.map((msg) => {
            const isMine = msg.from_profile_id === myProfileId
            const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl ${isMine ? 'bg-red-500 text-white rounded-br-md' : 'bg-[#1e1e2e] border border-[#2e2e3e] text-[#f0f0f8] rounded-bl-md'}`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.plain}</p>
                  <p className={`text-[10px] mt-0.5 ${isMine ? 'text-red-200' : 'text-[#555570]'} text-right`}>{time}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-[#252535] flex-shrink-0">
          {theirKeyMissing ? (
            <p className="text-xs text-yellow-400 flex-1 text-center py-1">
              En attente que {activeProfile.display_name} active la messagerie…
            </p>
          ) : (
            <>
              <input
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Message chiffré…"
                className="flex-1 bg-[#1a1a24] border border-[#2e2e3e] rounded-full px-4 py-2.5 text-sm text-[#f0f0f8] placeholder-[#555570] outline-none focus:border-red-500 transition-colors"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="w-10 h-10 bg-red-500 hover:bg-red-400 disabled:opacity-40 rounded-full flex items-center justify-center transition-all flex-shrink-0"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="translate-x-0.5">
                  <path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/>
                </svg>
              </button>
            </>
          )}
        </form>
      </div>
    )
  }

  // ── Conversations list ──
  return (
    <div className="p-4 flex flex-col gap-4 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Messages</h2>
        <p className="text-xs text-green-400">🔒 E2E chiffré</p>
      </div>

      {members.length === 0 && (
        <p className="text-sm text-[#555570] text-center py-8">Aucun autre membre dans le foyer.</p>
      )}

      <div className="flex flex-col gap-2">
        {members.map((profile) => (
          <button
            key={profile.id}
            onClick={() => openChat(profile)}
            className="flex items-center gap-3 bg-[#13131a] border border-[#252535] rounded-2xl px-4 py-3.5 text-left hover:border-[#3e3e5e] transition-colors active:scale-[0.98]"
          >
            <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="md" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[#f0f0f8]">{profile.display_name}</p>
              <p className="text-xs text-[#555570] mt-0.5">Appuie pour écrire</p>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#44445a] flex-shrink-0">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  )
}
