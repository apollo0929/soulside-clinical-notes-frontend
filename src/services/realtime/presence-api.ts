import type { NoteId, SessionId } from '@/domain/ids'
import { parseUserId } from '@/domain/ids'
import type { PresenceActivity } from '@/domain/schemas/realtime'
import { getActiveMockRealtimeServer } from '@/mock/realtime/active-server'
import { getActorHeaders, getActorIdentity } from '@/services/api/actor-provider'
import { apiRequest } from '@/services/api/api-client'
import { PRESENCE_HEARTBEAT_MS } from '@/services/realtime/presence'
import { getOrCreatePresenceSessionId } from '@/services/realtime/presence-session'

export type PresenceJoinInput = {
  readonly noteId: NoteId
  readonly activity: PresenceActivity
  readonly displayName?: string
  readonly sessionId?: SessionId
}

function resolveDisplayName(): string {
  const actor = getActorIdentity()
  return `${actor.role.charAt(0)}${actor.role.slice(1).toLowerCase()} ${String(actor.userId).slice(-4)}`
}

/**
 * Join/update presence for a note. Prefer in-process mock server when registered.
 */
export async function joinNotePresence(input: PresenceJoinInput): Promise<SessionId> {
  const sessionId = input.sessionId ?? getOrCreatePresenceSessionId()
  const actor = getActorIdentity()
  // Prefer HTTP in the browser so presence hits the shared MSW mock backend across tabs.
  // In-process is reserved for Vitest/jsdom without EventSource/MSW.
  const server = typeof EventSource === 'undefined' ? getActiveMockRealtimeServer() : null
  if (server) {
    server.joinPresence({
      sessionId,
      noteId: input.noteId,
      userId: parseUserId(actor.userId),
      displayName: input.displayName ?? resolveDisplayName(),
      role: actor.role,
      activity: input.activity,
    })
    return sessionId
  }

  await apiRequest('/api/realtime/presence/join', {
    method: 'POST',
    body: {
      sessionId,
      noteId: input.noteId,
      activity: input.activity,
      displayName: input.displayName ?? resolveDisplayName(),
    },
    headers: getActorHeaders(),
  })
  return sessionId
}

export async function heartbeatNotePresence(sessionId: SessionId): Promise<void> {
  const server = typeof EventSource === 'undefined' ? getActiveMockRealtimeServer() : null
  if (server) {
    server.heartbeatPresence(sessionId)
    return
  }
  await apiRequest('/api/realtime/presence/heartbeat', {
    method: 'POST',
    body: { sessionId },
    headers: getActorHeaders(),
  })
}

export async function leaveNotePresence(sessionId: SessionId): Promise<void> {
  const server = typeof EventSource === 'undefined' ? getActiveMockRealtimeServer() : null
  if (server) {
    server.leavePresence(sessionId)
    return
  }
  await apiRequest('/api/realtime/presence/leave', {
    method: 'POST',
    body: { sessionId },
    headers: getActorHeaders(),
  })
}

export function startPresenceHeartbeat(sessionId: SessionId): () => void {
  const handle = globalThis.setInterval(() => {
    void heartbeatNotePresence(sessionId)
  }, PRESENCE_HEARTBEAT_MS)
  return () => globalThis.clearInterval(handle)
}
