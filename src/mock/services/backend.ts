import { authorize } from '@/domain/authorization'
import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import type { NoteId } from '@/domain/ids'
import type {
  BulkAssignReviewerResponseDto,
  BulkRegenerateResponseDto,
  CreateVersionSuccessResponseDto,
  NoteDetailDto,
  NotesListResponseDto,
} from '@/domain/schemas'
import { FixedMockClock, type MockClock } from '@/mock/clock'
import type { NoteListSortDirection, NoteListSortField } from '@/mock/cursor'
import { MockDatabase } from '@/mock/database/repository'
import { createMockApiError, isMockApiError, type MockApiError } from '@/mock/errors'
import { FailureController } from '@/mock/failure'
import { LatencyController } from '@/mock/latency'
import { createMulberry32 } from '@/mock/prng'
import { DEFAULT_SEED_CONFIG, seedMockDatabase, type SeedResult } from '@/mock/seed/seed'
import {
  bulkAssignReviewer,
  type BulkAssignReviewerInput,
} from '@/mock/services/bulk-assign-reviewer'
import { type BulkRegenerateInput, bulkRegenerateNotes } from '@/mock/services/bulk-regenerate'
import { createNoteVersion, type CreateVersionInput } from '@/mock/services/create-version'
import { getNoteDetailFromDatabase } from '@/mock/services/note-detail'
import {
  DEFAULT_NOTES_LIST_LIMIT,
  listNotesFromDatabase,
  type NotesListRequest,
} from '@/mock/services/notes-list'
import { type ActorContext, type DevSeedRequest, runDevSeed } from '@/mock/services/seed-service'
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
      const result = transitionNote(this.database, input)
      return result.ok ? result.value : result.error
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
      const result = createNoteVersion(this.database, {
        actor: input.actor,
        noteId: input.noteId,
        baseVersionId: input.baseVersionId,
        content: input.content,
        clientMutationId: input.clientMutationId,
        occurredAt: input.occurredAt,
      })
      return result.ok ? result.response : result.error
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
      const result = bulkAssignReviewer(this.database, {
        actor: input.actor,
        noteIds: input.noteIds,
        reviewerId: input.reviewerId,
        clientMutationId: input.clientMutationId,
        occurredAt: input.occurredAt,
      })
      return result.ok ? result.response : result.error
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
      const result = bulkRegenerateNotes(this.database, {
        actor: input.actor,
        noteIds: input.noteIds,
        clientMutationId: input.clientMutationId,
        occurredAt: input.occurredAt,
      })
      return result.ok ? result.response : result.error
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
