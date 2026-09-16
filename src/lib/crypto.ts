'use client'

const DB_NAME = 'zion-keys'
const STORE_NAME = 'keypairs'
const LS_KEY = (id: string) => `zion-key-${id}`

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function getKey(db: IDBDatabase, profileId: string): Promise<CryptoKeyPair | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(profileId)
    req.onsuccess = () => resolve(req.result ?? null)
    req.onerror = () => reject(req.error)
  })
}

async function saveKey(db: IDBDatabase, profileId: string, pair: CryptoKeyPair): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const req = tx.objectStore(STORE_NAME).put(pair, profileId)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

async function backupToLocalStorage(profileId: string, pair: CryptoKeyPair): Promise<void> {
  try {
    const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    localStorage.setItem(LS_KEY(profileId), JSON.stringify(jwk))
  } catch {}
}

async function restoreFromLocalStorage(profileId: string): Promise<CryptoKeyPair | null> {
  try {
    const raw = localStorage.getItem(LS_KEY(profileId))
    if (!raw) return null
    const jwk = JSON.parse(raw)
    const privateKey = await crypto.subtle.importKey(
      'jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
    )
    const pubJwk = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, key_ops: [] }
    const publicKey = await crypto.subtle.importKey(
      'jwk', pubJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []
    )
    return { privateKey, publicKey }
  } catch {
    return null
  }
}

export async function getOrCreateKeyPair(profileId: string): Promise<{ keyPair: CryptoKeyPair; publicKeyJwk: JsonWebKey }> {
  const db = await openDB()
  let keyPair = await getKey(db, profileId)

  // If not in IndexedDB, try localStorage backup
  if (!keyPair) {
    keyPair = await restoreFromLocalStorage(profileId)
    if (keyPair) {
      await saveKey(db, profileId, keyPair)
    }
  }

  // Generate fresh extractable key if still nothing
  if (!keyPair) {
    keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey'])
    await saveKey(db, profileId, keyPair)
  }

  // Backup to localStorage only if extractable (new keys), silently skip old non-extractable ones
  await backupToLocalStorage(profileId, keyPair)

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
  return { keyPair, publicKeyJwk }
}

async function deriveSharedKey(myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<CryptoKey> {
  const theirPublicKey = await crypto.subtle.importKey('jwk', theirPublicKeyJwk, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function encryptBytes(key: CryptoKey, data: Uint8Array): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as unknown as ArrayBuffer)
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

async function decryptBytes(key: CryptoKey, encrypted: string): Promise<Uint8Array> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  return new Uint8Array(plain)
}

export async function encryptMessage(text: string, myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk)
  return encryptBytes(sharedKey, new TextEncoder().encode(text))
}

export async function decryptMessage(encrypted: string, myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk)
  const plain = await decryptBytes(sharedKey, encrypted)
  return new TextDecoder().decode(plain)
}

// Group key — AES-GCM symmetric key shared by all members
export async function generateGroupKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

export async function wrapGroupKey(groupKey: CryptoKey, myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk)
  const raw = await crypto.subtle.exportKey('raw', groupKey)
  return encryptBytes(sharedKey, new Uint8Array(raw))
}

export async function unwrapGroupKey(wrapped: string, myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<CryptoKey> {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk)
  const raw = await decryptBytes(sharedKey, wrapped)
  return crypto.subtle.importKey('raw', raw as unknown as ArrayBuffer, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptWithGroupKey(text: string, groupKey: CryptoKey): Promise<string> {
  return encryptBytes(groupKey, new TextEncoder().encode(text))
}

export async function decryptWithGroupKey(encrypted: string, groupKey: CryptoKey): Promise<string> {
  const plain = await decryptBytes(groupKey, encrypted)
  return new TextDecoder().decode(plain)
}

// Household shared key — stored as base64 raw bytes in Supabase
export async function generateHouseholdKey(): Promise<{ key: CryptoKey; keyB64: string }> {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  const keyB64 = btoa(String.fromCharCode(...new Uint8Array(raw)))
  return { key, keyB64 }
}

export async function importHouseholdKey(keyB64: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyB64), c => c.charCodeAt(0))
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptWithHouseholdKey(text: string, key: CryptoKey): Promise<string> {
  return encryptBytes(key, new TextEncoder().encode(text))
}

export async function decryptWithHouseholdKey(encrypted: string, key: CryptoKey): Promise<string> {
  const plain = await decryptBytes(key, encrypted)
  return new TextDecoder().decode(plain)
}
