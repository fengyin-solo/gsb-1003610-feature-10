import { DRONE_QUEUE_SEED, SEED_ROWS } from './seed'
import type { DroneQueueItem, EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'forest-fire-patrol:entries'
const QUEUE_STORAGE_KEY = 'forest-fire-patrol:drone-queue'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    return { ...fallback, ...parsed }
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  }
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// 异常核查队列单独存放：刷新后保留，已同步的清单靠来源标记去重。
let queueCache: DroneQueueItem[] | null = null

export function listDroneQueue(): DroneQueueItem[] {
  if (queueCache !== null) {
    return queueCache
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    queueCache = clone(DRONE_QUEUE_SEED)
    return queueCache
  }
  const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY)
  if (!raw) {
    queueCache = clone(DRONE_QUEUE_SEED)
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueCache))
    return queueCache
  }
  try {
    queueCache = JSON.parse(raw) as DroneQueueItem[]
  } catch {
    queueCache = clone(DRONE_QUEUE_SEED)
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queueCache))
  }
  return queueCache
}

export function saveDroneQueue(items: DroneQueueItem[]): void {
  queueCache = items
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items))
  }
}
