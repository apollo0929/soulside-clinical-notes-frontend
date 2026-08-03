import { parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import type { MockDatabase } from '@/mock/database/repository'
import { getActiveMockRealtimeServer } from '@/mock/realtime/active-server'
import { getActorIdentity } from '@/services/api/actor-provider'
import {
  getActiveRealtimeCoordinator,
  resetRealtimeEnvironmentForTests,
} from '@/services/realtime/realtime-bootstrap'

export type SoulsideRealtimeApi = {
  simulateRemoteVersionCreated: (input: {
    readonly noteId: string
    readonly bumpRevisionBy?: number
  }) => void
  /** Test-only: dispose coordinator, clear mock subscribers/presence, reset connectivity. */
  resetEnvironment: () => void
  getDiagnostics?: () => {
    readonly subscriberCount: number
    readonly presenceSessionCount: number
    readonly coordinatorDisposed: boolean
  }
}

let activeDatabase: MockDatabase | null = null

/** Called from mock backend bootstrap so DEV tools can synthesize remote events. */
export function registerRealtimeDevDatabase(database: MockDatabase): void {
  activeDatabase = database
}

export function resetRealtimeDevDatabaseForTests(): void {
  activeDatabase = null
}

/**
 * DEV/test hook so Playwright can inject remote version events into the
 * active mock realtime server and the local coordinator.
 */
export function installDevRealtimeApi(): void {
  const target = globalThis as typeof globalThis & {
    __SOULSIDE_REALTIME__?: SoulsideRealtimeApi
  }
  target.__SOULSIDE_REALTIME__ = {
    simulateRemoteVersionCreated(input) {
      const server = getActiveMockRealtimeServer()
      const database = activeDatabase
      if (!server || !database) {
        throw new Error('No active mock realtime server/database')
      }
      const noteId = parseNoteId(input.noteId)
      const note = database.getNote(noteId)
      if (!note) {
        throw new Error(`Note ${input.noteId} not found`)
      }
      const current = database.getVersion(note.currentVersionId)
      if (!current) {
        throw new Error('Current version missing')
      }
      const bump = input.bumpRevisionBy ?? 1
      const actor = getActorIdentity()
      const syntheticVersion = Object.freeze({
        ...current,
        id: parseVersionId(`${String(current.id)}_rt_${current.revisionNumber + bump}`),
        revisionNumber: current.revisionNumber + bump,
        parentVersionId: current.id,
        authorId: parseUserId(actor.userId),
        authorRole: actor.role,
      }) satisfies NoteVersion

      const syntheticNote = Object.freeze({
        ...note,
        currentVersionId: syntheticVersion.id,
      }) satisfies Note

      database.appendVersion(syntheticVersion)
      database.updateNote(syntheticNote)

      const event = server.emitVersionCreated({
        note: syntheticNote,
        version: syntheticVersion,
        actor: { userId: parseUserId(actor.userId), role: actor.role },
        originatingClientMutationId: null,
        wasIdempotentReplay: false,
      })
      if (event) {
        getActiveRealtimeCoordinator()?.injectEvent(event)
      }
    },
    resetEnvironment() {
      resetRealtimeEnvironmentForTests()
    },
    getDiagnostics() {
      const server = getActiveMockRealtimeServer()
      const coordinator = getActiveRealtimeCoordinator()
      return {
        subscriberCount: server?.getSubscriberCount() ?? 0,
        presenceSessionCount: server?.getPresenceSessionCount() ?? 0,
        coordinatorDisposed: coordinator === null,
      }
    },
  }
}
