import { authorize } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type { NoteId, VersionId } from '@/domain/ids'
import type {
  BulkAssignReviewerResponseDto,
  BulkRegenerateResponseDto,
  CreateVersionSuccessResponseDto,
  NoteDetailDto,
  NotesListResponseDto,
  NoteVersionDetailDto,
} from '@/domain/schemas'
import { FixedMockClock, type MockClock } from '@/mock/clock'
import type { NoteListSortDirection, NoteListSortField } from '@/mock/cursor'
import { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'
import { FailureController } from '@/mock/failure'
import { LatencyController } from '@/mock/latency'
import { createMulberry32 } from '@/mock/prng'
import { RealtimeServer } from '@/mock/realtime/realtime-server'
import { DEFAULT_SEED_CONFIG, seedMockDatabase, type SeedResult } from '@/mock/seed/seed'
import {
  bulkAssignReviewer,
  type BulkAssignReviewerInput,
} from '@/mock/services/bulk-assign-reviewer'
import { type BulkRegenerateInput, bulkRegenerateNotes } from '@/mock/services/bulk-regenerate'
import { createNoteVersion, type CreateVersionInput } from '@/mock/services/create-version'
import { getNoteDetailFromDatabase } from '@/mock/services/note-detail'
import { getNoteVersionFromDatabase } from '@/mock/services/note-version-detail'
import {
  DEFAULT_NOTES_LIST_LIMIT,
  listNotesFromDatabase,
  type NotesListRequest,
} from '@/mock/services/notes-list'
import { type ActorContext, type DevSeedRequest, runDevSeed } from '@/mock/services/seed-service'
import { MockTelemetryService } from '@/mock/services/telemetry-service'
import {
  transitionNote,
  type TransitionNoteInput,
  type TransitionNoteSuccess,
} from '@/mock/services/transition'

export type MockBackendOptions = {
  readonly seed?: number
  readonly latencySeed?: number
  readonly failureSeed?: number
  readonly autoSeed?: boolean
  readonly now?: IsoDateTime
  readonly clock?: MockClock
}

export type ListNotesServiceInput = {
  readonly actor: ActorContext
  readonly request: NotesListRequest
  readonly signal?: AbortSignal
}

export type GetNoteDetailServiceInput = {
  readonly actor: ActorContext
  readonly noteId: NoteId
  readonly signal?: AbortSignal
}

export type GetNoteVersionServiceInput = {
  readonly actor: ActorContext
  readonly noteId: NoteId
  readonly versionId: VersionId
  readonly signal?: AbortSignal
}

export type DevSeedServiceInput = {
  readonly actor: ActorContext
  readonly request: DevSeedRequest
  readonly signal?: AbortSignal
}

export type CreateVersionServiceInput = CreateVersionInput & {
  readonly signal?: AbortSignal
}

/**
 * Transport-independent mock backend application service.
 */
export class MockBackendService {
  readonly database: MockDatabase
  readonly latency: LatencyController
  readonly failures: FailureController
  readonly clock: MockClock
  readonly realtime: RealtimeServer
  readonly telemetry: MockTelemetryService
  private readonly fixedClock: FixedMockClock | null

  constructor(options: MockBackendOptions = {}) {
    this.database = new MockDatabase()
    const latencyRandom = createMulberry32(options.latencySeed ?? 7)
    const failureRandom = createMulberry32(options.failureSeed ?? 11)
    this.latency = LatencyController.createDefault(latencyRandom)
    this.failures = new FailureController({ random: failureRandom, defaultRate: 0.05 })

    if (options.clock) {
      this.clock = options.clock
      this.fixedClock = null
    } else {
      this.fixedClock = new FixedMockClock(
        options.now ?? parseIsoDateTime('2024-07-01T00:00:00.000Z'),
      )
      this.clock = this.fixedClock
    }

    this.realtime = new RealtimeServer({
      database: this.database,
      clock: { now: () => this.clock.now() },
    })
    this.telemetry = new MockTelemetryService()

    if (options.autoSeed !== false) {
      seedMockDatabase(this.database, {
        ...DEFAULT_SEED_CONFIG,
        seed: options.seed ?? DEFAULT_SEED_CONFIG.seed,
      })
    }
  }

  setNow(now: IsoDateTime): void {
    if (this.fixedClock) {
      this.fixedClock.set(now)
      return
    }
    throw new Error('setNow is only supported when using the default FixedMockClock')
  }

  /** Test helper: disable latency and failure injection. */
  configureForTests(): void {
    this.latency.disable()
    this.failures.disable()
  }

  async listNotes(input: ListNotesServiceInput): Promise<NotesListResponseDto | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.list')

      const auth = authorize({
        permission: 'NOTES_VIEW',
        actor: { userId: input.actor.userId, role: input.actor.role },
        resource: null,
      })
      if (!auth.allowed) {
        return createMockApiError({
          code: 'FORBIDDEN',
          status: 403,
          message: auth.reason,
          details: { reasonCode: auth.reasonCode },
        })
      }

      const result = listNotesFromDatabase(this.database, input.request, this.clock.now())
      return result.ok ? result.response : result.error
    } catch (error) {
      return toMockError(error)
    }
  }

  async getNoteDetail(input: GetNoteDetailServiceInput): Promise<NoteDetailDto | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.detail')

      const note = this.database.getNote(input.noteId)
      if (!note) {
        return createMockApiError({
          code: 'NOT_FOUND',
          status: 404,
          message: `Note ${input.noteId} was not found.`,
        })
      }

      const versions = this.database.listVersionsForNote(note.id)
      const firstVersion = [...versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
      if (!firstVersion) {
        return createMockApiError({
          code: 'NOT_FOUND',
          status: 404,
          message: `Versions for note ${input.noteId} were not found.`,
        })
      }

      const auth = authorize({
        permission: 'NOTE_CONTENT_VIEW',
        actor: { userId: input.actor.userId, role: input.actor.role },
        resource: {
          kind: 'NOTE',
          noteId: note.id,
          clinicianId: firstVersion.authorId,
          assignedReviewerId: note.assignedReviewerId,
        },
      })
      if (!auth.allowed) {
        return createMockApiError({
          code: 'FORBIDDEN',
          status: 403,
          message: auth.reason,
          details: { reasonCode: auth.reasonCode },
        })
      }

      const result = getNoteDetailFromDatabase(this.database, input.noteId)
      return result.ok ? result.detail : result.error
    } catch (error) {
      return toMockError(error)
    }
  }

  async getNoteVersion(
    input: GetNoteVersionServiceInput,
  ): Promise<NoteVersionDetailDto | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.versionDetail')

      const note = this.database.getNote(input.noteId)
      if (!note) {
        return createMockApiError({
          code: 'NOT_FOUND',
          status: 404,
          message: `Note ${input.noteId} was not found.`,
        })
      }

      const versions = this.database.listVersionsForNote(note.id)
      const firstVersion = [...versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
      if (!firstVersion) {
        return createMockApiError({
          code: 'NOT_FOUND',
          status: 404,
          message: `Versions for note ${input.noteId} were not found.`,
        })
      }

      const auth = authorize({
        permission: 'NOTE_CONTENT_VIEW',
        actor: { userId: input.actor.userId, role: input.actor.role },
        resource: {
          kind: 'NOTE',
          noteId: note.id,
          clinicianId: firstVersion.authorId,
          assignedReviewerId: note.assignedReviewerId,
        },
      })
      if (!auth.allowed) {
        return createMockApiError({
          code: 'FORBIDDEN',
          status: 403,
          message: auth.reason,
          details: { reasonCode: auth.reasonCode },
        })
      }

      const result = getNoteVersionFromDatabase(this.database, input.noteId, input.versionId)
      return result.ok ? result.version : result.error
    } catch (error) {
      return toMockError(error)
    }
  }

  async seed(input: DevSeedServiceInput): Promise<SeedResult | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('dev.seed')

      const result = runDevSeed(this.database, input.actor, input.request)
      return result.ok ? result.result : result.error
    } catch (error) {
      return toMockError(error)
    }
  }

  async transition(
    input: TransitionNoteInput & { readonly signal?: AbortSignal },
  ): Promise<TransitionNoteSuccess | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.transition')
      const before = this.database.getNote(input.noteId)
      const result = transitionNote(this.database, input)
      if (result.ok) {
        try {
          const after = this.database.getNote(input.noteId)
          if (before && after && before.status !== after.status) {
            this.realtime.emitStatusChanged({
              note: after,
              fromStatus: before.status,
              toStatus: after.status,
              actor: input.actor,
            })
          }
          if (result.value.newVersion && after) {
            this.realtime.emitVersionCreated({
              note: after,
              version: result.value.newVersion,
              actor: input.actor,
              originatingClientMutationId: null,
              wasIdempotentReplay: false,
            })
          }
        } catch {
          // Realtime fan-out must never fail the REST write path.
        }
        return result.value
      }
      return result.error
    } catch (error) {
      return toMockError(error)
    }
  }

  async createVersion(
    input: CreateVersionServiceInput,
  ): Promise<CreateVersionSuccessResponseDto | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.createVersion')
      const priorCompleted = this.database.getCompletedMutation(input.clientMutationId)
      const wasIdempotentReplay = priorCompleted?.operation === 'CREATE_NOTE_VERSION'
      const result = createNoteVersion(this.database, {
        actor: input.actor,
        noteId: input.noteId,
        baseVersionId: input.baseVersionId,
        content: input.content,
        clientMutationId: input.clientMutationId,
        occurredAt: input.occurredAt,
      })
      if (!result.ok) {
        return result.error
      }
      if (!wasIdempotentReplay) {
        try {
          const note = this.database.getNote(input.noteId)
          const version = this.database.getVersion(result.response.version.id)
          if (note && version) {
            this.realtime.emitVersionCreated({
              note,
              version,
              actor: input.actor,
              originatingClientMutationId: input.clientMutationId,
              wasIdempotentReplay: false,
            })
          }
        } catch {
          // Realtime fan-out must never fail the REST write path.
        }
      }
      return result.response
    } catch (error) {
      return toMockError(error)
    }
  }

  async bulkAssignReviewer(
    input: BulkAssignReviewerInput & { readonly signal?: AbortSignal },
  ): Promise<BulkAssignReviewerResponseDto | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.bulkAssign')
      const priorCompleted = this.database.getCompletedMutation(input.clientMutationId)
      const wasIdempotentReplay = priorCompleted?.operation === 'BULK_ASSIGN_REVIEWER'
      const result = bulkAssignReviewer(this.database, {
        actor: input.actor,
        noteIds: input.noteIds,
        reviewerId: input.reviewerId,
        clientMutationId: input.clientMutationId,
        occurredAt: input.occurredAt,
      })
      if (!result.ok) {
        return result.error
      }
      if (!wasIdempotentReplay) {
        try {
          for (const item of result.response.results) {
            if (!item.success) {
              continue
            }
            const note = this.database.getNote(item.noteId)
            if (note) {
              this.realtime.emitReviewerChanged({ note, actor: input.actor })
            }
          }
        } catch {
          // Realtime fan-out must never fail the REST write path.
        }
      }
      return result.response
    } catch (error) {
      return toMockError(error)
    }
  }

  async bulkRegenerate(
    input: BulkRegenerateInput & { readonly signal?: AbortSignal },
  ): Promise<BulkRegenerateResponseDto | MockApiError> {
    try {
      await this.latency.wait({ signal: input.signal })
      this.failures.maybeInject('notes.bulkRegenerate')
      const priorCompleted = this.database.getCompletedMutation(input.clientMutationId)
      const wasIdempotentReplay = priorCompleted?.operation === 'BULK_REGENERATE'
      // Capture statuses before mutate for emission when regenerating via nested transition.
      const beforeById = new Map(
        input.noteIds.map((noteId) => [noteId, this.database.getNote(noteId)?.status] as const),
      )
      const result = bulkRegenerateNotes(this.database, {
        actor: input.actor,
        noteIds: input.noteIds,
        clientMutationId: input.clientMutationId,
        occurredAt: input.occurredAt,
      })
      if (!result.ok) {
        return result.error
      }
      if (!wasIdempotentReplay) {
        try {
          for (const item of result.response.results) {
            if (!item.success) {
              continue
            }
            const note = this.database.getNote(item.noteId)
            const fromStatus = beforeById.get(item.noteId)
            if (note && fromStatus && fromStatus !== note.status) {
              this.realtime.emitStatusChanged({
                note,
                fromStatus,
                toStatus: note.status,
                actor: input.actor,
              })
            }
          }
        } catch {
          // Realtime fan-out must never fail the REST write path.
        }
      }
      return result.response
    } catch (error) {
      return toMockError(error)
    }
  }
}

function toMockError(error: unknown): MockApiError {
  if (isMockApiError(error)) {
    return error
  }
  return createMockApiError({
    code: 'SIMULATED_INTERNAL_ERROR',
    status: 500,
    message: 'Unexpected mock backend failure.',
  })
}

export type { ActorContext, NoteListSortDirection, NoteListSortField, NotesListRequest }
export { DEFAULT_NOTES_LIST_LIMIT }
