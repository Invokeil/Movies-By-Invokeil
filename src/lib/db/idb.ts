/* ── invokeil_movies — browser IndexedDB (Local-first layer) ──────────
   Minimal promise-based wrapper. Mirrors the planned stores:
   media / searches / history / progress / favorites / watchlist /
   recommendations / preferences / aiCache / settings                    */

const DB_NAME = 'invokeil_movies'
const DB_VERSION = 1

export const STORES = [
  'media',        // cached UnifiedMedia (metadata lifecycle envelope)
  'searches',     // recent search queries
  'history',      // watch history
  'progress',     // watch progress (resume)
  'favorites',
  'watchlist',
  'recommendations', // cached AI/local recommendation results
  'aiCache',      // AI response cache
  'settings',     // preferences (theme, glass intensity, etc.)
] as const

export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB unavailable'))
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) {
            db.createObjectStore(s, { keyPath: 'key' })
          }
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (os: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | null> {
  try {
    const db = await openDB()
    return await new Promise<T | null>((resolve, reject) => {
      const t = db.transaction(store, mode)
      const os = t.objectStore(store)
      let request: IDBRequest<T> | void
      try {
        request = fn(os)
      } catch (e) {
        reject(e)
        return
      }
      t.oncomplete = () => resolve(request && 'result' in request ? request.result : null)
      t.onerror = () => reject(t.error)
      t.onabort = () => reject(t.error)
    })
  } catch {
    return null // graceful: IDB failure never breaks the app
  }
}

export const idb = {
  /** Returns the stored VALUE (unwrapped from the {key, value} record). */
  get: async <T>(store: StoreName, key: string): Promise<T | null> => {
    const rec = await tx<{ key: string; value: T }>(store, 'readonly', (os) =>
      os.get(key) as IDBRequest<{ key: string; value: T }>
    )
    return rec ? (rec as { key: string; value: T }).value : null
  },

  put: (store: StoreName, key: string, value: unknown) =>
    tx(store, 'readwrite', (os) => os.put({ key, value })),

  delete: (store: StoreName, key: string) =>
    tx(store, 'readwrite', (os) => os.delete(key)),

  all: <T>(store: StoreName) =>
    tx<{ key: string; value: T }[]>(store, 'readonly', (os) => os.getAll() as IDBRequest<{ key: string; value: T }[]>),

  clear: (store: StoreName) => tx(store, 'readwrite', (os) => os.clear()),

  clearAll: async () => {
    for (const s of STORES) await idb.clear(s)
  },

  sizeEstimate: async (): Promise<{ usageMB: number; quotaMB: number }> => {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate()
        return {
          usageMB: Math.round(((est.usage ?? 0) / 1024 / 1024) * 10) / 10,
          quotaMB: Math.round((est.quota ?? 0) / 1024 / 1024),
        }
      }
    } catch { /* noop */ }
    return { usageMB: 0, quotaMB: 0 }
  },
}
