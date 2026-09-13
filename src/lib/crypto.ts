'use client'

const DB_NAME = 'zion-keys'
const STORE_NAME = 'keypairs'

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

export async function getOrCreateKeyPair(profileId: string): Promise<{ keyPair: CryptoKeyPair; publicKeyJwk: JsonWebKey }> {
  const db = await openDB()
  let keyPair = await getKey(db, profileId)
  if (!keyPair) {
    keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey'])
    await saveKey(db, profileId, keyPair)
  }
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

export async function encryptMessage(text: string, myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<string> {
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, new TextEncoder().encode(text))
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptMessage(encrypted: string, myPrivateKey: CryptoKey, theirPublicKeyJwk: JsonWebKey): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const iv = combined.slice(0, 12)
  const ciphertext = combined.slice(12)
  const sharedKey = await deriveSharedKey(myPrivateKey, theirPublicKeyJwk)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, ciphertext)
  return new TextDecoder().decode(plain)
}
