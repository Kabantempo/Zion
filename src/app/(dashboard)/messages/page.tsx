'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getProfileSession } from '@/lib/profile-session'
import { Avatar } from '@/components/ui/avatar'
import {
  getOrCreateKeyPair,
  encryptMessage, decryptMessage,
  generateGroupKey, wrapGroupKey, unwrapGroupKey,
  encryptWithGroupKey, decryptWithGroupKey,
  generateHouseholdKey, importHouseholdKey,
  encryptWithHouseholdKey, decryptWithHouseholdKey,
} from '@/lib/crypto'
import type { Profile } from '@/types'

type ChatTarget = 'group' | Profile

interface RawMessage {
  id: string
  from_profile_id: string
  to_profile_id: string | null
  encrypted_content: string
  created_at: string
}

interface Message extends RawMessage {
  plain: string
  senderName?: string
  senderColor?: string
  senderAvatar?: string | null
}

export default function MessagesPage() {
  const router = useRouter()
  const supabase = createClient()
  const [myProfileId, setMyProfileId] = useState('')
  const [householdId, setHouseholdId] = useState('')
  const [members, setMembers] = useState<Profile[]>([])
  const [allMembers, setAllMembers] = useState<Profile[]>([])
  const [chat, setChat] = useState<ChatTarget | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [groupStatus, setGroupStatus] = useState<'ok' | 'waiting' | 'setup'>('waiting')
  const [theirKeyMissing, setTheirKeyMissing] = useState(false)

  const keyPairRef = useRef<CryptoKeyPair | null>(null)
  const theirKeyRef = useRef<JsonWebKey | null>(null)
  const groupKeyRef = useRef<CryptoKey | null>(null)
  const householdKeyRef = useRef<CryptoKey | null>(null)
  const lastMsgIdRef = useRef<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const myProfileIdRef = useRef('')
  const householdIdRef = useRef('')

  useEffect(() => {
    const session = getProfileSession()
    if (!session) { router.replace('/profiles'); return }
    setMyProfileId(session.profileId)
    myProfileIdRef.current = session.profileId
    setHouseholdId(session.householdId)
    householdIdRef.current = session.householdId
    init(session.profileId, session.householdId)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function init(profileId: string, householdId: string) {
    const { keyPair, publicKeyJwk } = await getOrCreateKeyPair(profileId)
    keyPairRef.current = keyPair
    await fetch('/api/messages/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, publicKeyJwk }),
    })

    // Load or create the household shared encryption key
    const hkRes = await fetch(`/api/messages/household-key?householdId=${householdId}`)
    const hkRow = await hkRes.json()
    if (hkRow?.key) {
      householdKeyRef.current = await importHouseholdKey(hkRow.key)
    } else {
      const { key, keyB64 } = await generateHouseholdKey()
      householdKeyRef.current = key
      await fetch('/api/messages/household-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, key: keyB64 }),
      })
    }
    const { data } = await supabase.from('household_members')
      .select('profile:profiles(id, display_name, color, avatar_url)')
      .eq('household_id', householdId)
    const all: Profile[] = (data ?? [])
      .map((m: any) => Array.isArray(m.profile) ? m.profile[0] : m.profile)
      .filter(Boolean)
    setAllMembers(all)
    setMembers(all.filter(p => p.id !== profileId))
    setLoading(false)
  }

  function senderInfo(fromId: string) {
    const p = allMembers.find(m => m.id === fromId)
    return { name: p?.display_name ?? '?', color: p?.color ?? '#555', avatar: p?.avatar_url ?? null }
  }

  // Load or setup the group key
  async function loadGroupKey(allProfiles: Profile[]): Promise<CryptoKey | null> {
    const myId = myProfileIdRef.current
    const hid = householdIdRef.current
    const myKeyPair = keyPairRef.current
    if (!myKeyPair) return null

    // Try to fetch my wrapped group key
    const res = await fetch(`/api/messages/group-key?householdId=${hid}&profileId=${myId}`)
    const row = await res.json()

    if (row?.wrapped_key && row?.created_by) {
      // Unwrap using shared secret with creator
      const creatorId = row.created_by
      let key: CryptoKey | null = null
      if (creatorId === myId) {
        const myPubRes = await fetch(`/api/messages/keys?profileId=${myId}`)
        const myPubRow = await myPubRes.json()
        if (myPubRow?.public_key_jwk) {
          try { key = await unwrapGroupKey(row.wrapped_key, myKeyPair.privateKey, JSON.parse(myPubRow.public_key_jwk)) } catch {}
        }
      } else {
        const creatorPubRes = await fetch(`/api/messages/keys?profileId=${creatorId}`)
        const creatorPubRow = await creatorPubRes.json()
        if (creatorPubRow?.public_key_jwk) {
          try { key = await unwrapGroupKey(row.wrapped_key, myKeyPair.privateKey, JSON.parse(creatorPubRow.public_key_jwk)) } catch {}
        }
      }
      if (key) return key
      // Unwrap failed (key pair changed) — fall through to regenerate
    }

    // No key yet — I'll create it and distribute to all members who have public keys
    setGroupStatus('setup')
    const groupKey = await generateGroupKey()

    // Fetch all members' public keys
    const wrappedKeys: { profileId: string; wrappedKey: string }[] = []
    for (const profile of allProfiles) {
      const pkRes = await fetch(`/api/messages/keys?profileId=${profile.id}`)
      const pkRow = await pkRes.json()
      if (!pkRow?.public_key_jwk) continue
      const theirPub = JSON.parse(pkRow.public_key_jwk)
      const wrapped = await wrapGroupKey(groupKey, myKeyPair.privateKey, theirPub)
      wrappedKeys.push({ profileId: profile.id, wrappedKey: wrapped })
    }

    // Also wrap for myself (using my own public key as "their" key)
    const myPubRes = await fetch(`/api/messages/keys?profileId=${myId}`)
    const myPubRow = await myPubRes.json()
    if (myPubRow?.public_key_jwk) {
      const wrapped = await wrapGroupKey(groupKey, myKeyPair.privateKey, JSON.parse(myPubRow.public_key_jwk))
      wrappedKeys.push({ profileId: myId, wrappedKey: wrapped })
    }

    if (wrappedKeys.length > 0) {
      await fetch('/api/messages/group-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId: hid, createdBy: myId, wrappedKeys }),
      })
    }

    return groupKey
  }

  async function openChat(target: ChatTarget) {
    if (pollRef.current) clearInterval(pollRef.current)
    setChat(target)
    setMessages([])
    setTheirKeyMissing(false)
    setGroupStatus('waiting')
    lastMsgIdRef.current = null
    theirKeyRef.current = null
    groupKeyRef.current = null

    if (target === 'group') {
      const gk = await loadGroupKey(allMembers)
      groupKeyRef.current = gk
      setGroupStatus(gk ? 'ok' : 'waiting')
    } else {
      const res = await fetch(`/api/messages/keys?profileId=${(target as Profile).id}`)
      const keyRow = await res.json()
      if (!keyRow?.public_key_jwk) setTheirKeyMissing(true)
      else theirKeyRef.current = JSON.parse(keyRow.public_key_jwk)
    }

    await loadMessages(target)
    pollRef.current = setInterval(() => pollNew(target), 3000)
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
  }

  const decryptOne = useCallback(async (msg: RawMessage, target: ChatTarget): Promise<Message> => {
    const { name, color, avatar } = senderInfo(msg.from_profile_id)
    const raw = msg.encrypted_content

    // Try household shared key first (new system)
    const hk = householdKeyRef.current
    if (hk) {
      try {
        const plain = await decryptWithHouseholdKey(raw, hk)
        return { ...msg, plain, senderName: name, senderColor: color, senderAvatar: avatar }
      } catch {}
    }

    // Fallback: old per-person ECDH or group key
    if (target === 'group') {
      const gk = groupKeyRef.current
      if (gk) {
        try {
          const plain = await decryptWithGroupKey(raw, gk)
          return { ...msg, plain, senderName: name, senderColor: color, senderAvatar: avatar }
        } catch {}
      }
    } else {
      const theirKey = theirKeyRef.current
      if (theirKey && keyPairRef.current) {
        try {
          const plain = await decryptMessage(raw, keyPairRef.current.privateKey, theirKey)
          return { ...msg, plain }
        } catch {}
      }
    }

    // Last resort: show raw (was stored as plaintext during transition)
    return { ...msg, plain: raw, senderName: name, senderColor: color, senderAvatar: avatar }
  }, [allMembers])

  async function loadMessages(target: ChatTarget) {
    const myId = myProfileIdRef.current
    const hid = householdIdRef.current
    const url = target === 'group'
      ? `/api/messages?householdId=${hid}`
      : `/api/messages?householdId=${hid}&from=${myId}&to=${(target as Profile).id}`
    const res = await fetch(url)
    const msgs: RawMessage[] = await res.json()
    if (!Array.isArray(msgs)) return
    const decoded = await Promise.all(msgs.map(m => decryptOne(m, target)))
    setMessages(decoded)
    if (decoded.length > 0) lastMsgIdRef.current = decoded[decoded.length - 1].id
  }

  async function pollNew(target: ChatTarget) {
    const myId = myProfileIdRef.current
    const hid = householdIdRef.current
    const url = target === 'group'
      ? `/api/messages?householdId=${hid}`
      : `/api/messages?householdId=${hid}&from=${myId}&to=${(target as Profile).id}`
    const res = await fetch(url)
    const msgs: RawMessage[] = await res.json()
    if (!Array.isArray(msgs) || msgs.length === 0) return
    const lastId = lastMsgIdRef.current
    const lastIdx = lastId ? msgs.findIndex(m => m.id === lastId) : -1
    const newRaw = lastIdx >= 0 ? msgs.slice(lastIdx + 1) : []
    if (newRaw.length === 0) return
    const decoded = await Promise.all(newRaw.map(m => decryptOne(m, target)))
    setMessages(prev => [...prev, ...decoded])
    lastMsgIdRef.current = decoded[decoded.length - 1].id
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    const isGroup = chat === 'group'
    setSending(true)
    try {
      const toProfileId = isGroup ? null : (chat as Profile).id
      const hk = householdKeyRef.current
      const content = hk
        ? await encryptWithHouseholdKey(text.trim(), hk)
        : text.trim()
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ householdId, fromProfileId: myProfileId, toProfileId, content }),
      })
      if (res.ok) {
        const msg: RawMessage = await res.json()
        const { name, color, avatar } = senderInfo(myProfileId)
        setMessages(prev => [...prev, { ...msg, plain: text.trim(), senderName: name, senderColor: color, senderAvatar: avatar }])
        lastMsgIdRef.current = msg.id
        setText('')
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      }
    } catch (err) { console.error(err) }
    setSending(false)
  }

  function back() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setChat(null)
    setMessages([])
    theirKeyRef.current = null
    groupKeyRef.current = null
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── Chat view ──
  if (chat !== null) {
    const isGroup = chat === 'group'
    const chatProfile = isGroup ? null : chat as Profile
    const canSend = true

    return (
      <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-up">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#252535] flex-shrink-0">
          <button onClick={back} className="text-[#7070a0] hover:text-[#f0f0f8] transition-colors mr-1">←</button>
          {isGroup ? (
            <div className="flex -space-x-2 mr-1">
              {allMembers.slice(0, 3).map(m => (
                <Avatar key={m.id} name={m.display_name} color={m.color} avatarUrl={m.avatar_url} size="sm" className="ring-2 ring-[#13131a]" />
              ))}
            </div>
          ) : (
            <Avatar name={chatProfile!.display_name} color={chatProfile!.color} avatarUrl={chatProfile!.avatar_url} size="sm" />
          )}
          <div>
            <p className="text-sm font-bold text-[#f0f0f8]">{isGroup ? 'Groupe Zion' : chatProfile!.display_name}</p>
            <p className="text-[10px] text-green-400">🔒 Chiffré bout en bout</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
              <p className="text-4xl">{isGroup ? '👥' : '💬'}</p>
              {groupStatus === 'setup' && isGroup
                ? <p className="text-sm text-[#7070a0]">Génération de la clé de groupe…</p>
                : groupStatus === 'waiting' && isGroup
                ? <p className="text-sm text-yellow-400">En attente que quelqu'un crée la clé de groupe…</p>
                : <p className="text-sm text-[#7070a0]">Début {isGroup ? 'du groupe' : 'de la conversation'}</p>
              }
              {theirKeyMissing && !isGroup && (
                <p className="text-xs text-yellow-400 mt-1 max-w-[240px]">
                  ⚠️ {chatProfile!.display_name} doit ouvrir Messages une fois pour activer le chiffrement.
                </p>
              )}
            </div>
          )}
          {messages.map((msg, i) => {
            const isMine = msg.from_profile_id === myProfileId
            const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            const showName = isGroup && !isMine && (i === 0 || messages[i - 1].from_profile_id !== msg.from_profile_id)
            const isLast = i === messages.length - 1 || messages[i + 1].from_profile_id !== msg.from_profile_id
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                {showName && <p className="text-[10px] text-[#7070a0] mb-0.5 ml-10">{msg.senderName}</p>}
                <div className={`flex items-end gap-2 w-full ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                  {isGroup && !isMine && (
                    isLast
                      ? <Avatar name={msg.senderName ?? '?'} color={msg.senderColor ?? '#555'} avatarUrl={msg.senderAvatar} size="sm" className="flex-shrink-0 mb-0.5" />
                      : <div className="w-8 flex-shrink-0" />
                  )}
                  <div className={`max-w-[78%] px-3.5 py-2 rounded-2xl ${isMine ? 'bg-red-500 text-white rounded-br-md' : 'bg-[#1e1e2e] border border-[#2e2e3e] text-[#f0f0f8] rounded-bl-md'}`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.plain}</p>
                    <p className={`text-[10px] mt-0.5 ${isMine ? 'text-red-200' : 'text-[#555570]'} text-right`}>{time}</p>
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-[#252535] flex-shrink-0">
          {!canSend ? (
            <p className="text-xs text-yellow-400 flex-1 text-center py-1">
              {isGroup ? 'Chargement de la clé de groupe…' : `En attente que ${chatProfile!.display_name} active la messagerie…`}
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

  // ── List ──
  return (
    <div className="p-4 flex flex-col gap-3 animate-slide-up">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-black text-[#f0f0f8]">Messages</h2>
        <p className="text-xs text-green-400">🔒 E2E chiffré</p>
      </div>

      <button
        onClick={() => openChat('group')}
        className="flex items-center gap-3 bg-gradient-to-r from-red-500/10 to-red-400/5 border border-red-500/20 rounded-2xl px-4 py-3.5 text-left hover:border-red-500/40 transition-colors active:scale-[0.98]"
      >
        <div className="flex -space-x-2">
          {allMembers.slice(0, 3).map(m => (
            <Avatar key={m.id} name={m.display_name} color={m.color} avatarUrl={m.avatar_url} size="sm" className="ring-2 ring-[#13131a]" />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#f0f0f8]">Groupe Zion</p>
          <p className="text-xs text-[#7070a0] mt-0.5">🔒 {allMembers.length} membres · chiffré</p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#44445a] flex-shrink-0"><path d="M9 18l6-6-6-6"/></svg>
      </button>

      {members.length > 0 && (
        <>
          <p className="text-xs font-semibold text-[#7070a0] uppercase tracking-widest px-1 mt-1">Messages privés</p>
          <div className="flex flex-col gap-2">
            {members.map(profile => (
              <button
                key={profile.id}
                onClick={() => openChat(profile)}
                className="flex items-center gap-3 bg-[#13131a] border border-[#252535] rounded-2xl px-4 py-3.5 text-left hover:border-[#3e3e5e] transition-colors active:scale-[0.98]"
              >
                <Avatar name={profile.display_name} color={profile.color} avatarUrl={profile.avatar_url} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#f0f0f8]">{profile.display_name}</p>
                  <p className="text-xs text-[#555570] mt-0.5">🔒 Chiffré bout en bout</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#44445a] flex-shrink-0"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
