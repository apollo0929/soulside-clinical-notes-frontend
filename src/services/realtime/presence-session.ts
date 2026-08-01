import { parseSessionId, type SessionId } from '@/domain/ids'

const STORAGE_KEY = 'soulside.presence.sessionId'

/**
 * Stable per-tab presence session id. sessionStorage survives reloads in the same tab;
 * a new tab gets a new id.
 */
export function getOrCreatePresenceSessionId(): SessionId {
  if (typeof sessionStorage !== 'undefined') {
    const existing = sessionStorage.getItem(STORAGE_KEY)
    if (existing) {
      try {
        return parseSessionId(existing)
      } catch {
        // fall through and recreate
      }
    }
  }
  const value =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? `prs_${globalThis.crypto.randomUUID()}`
      : `prs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const sessionId = parseSessionId(value)
  try {
    sessionStorage?.setItem(STORAGE_KEY, value)
  } catch {
    // private mode / unavailable
  }
  return sessionId
}
