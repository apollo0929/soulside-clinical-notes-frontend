export { FixedMockClock, type MockClock } from '@/mock/clock'
export {
  decodeCursor,
  encodeCursor,
  NOTE_LIST_SORT_FIELDS,
  type NoteListSortDirection,
  type NoteListSortField,
  type NotesListCursorPayload,
} from '@/mock/cursor'
export { MockDatabase, type MockDatabaseSnapshot } from '@/mock/database/repository'
export {
  assertMockDatabaseIntegrity,
  type IntegrityIssue,
  validateMockDatabaseIntegrity,
} from '@/mock/database/validate'
export {
  createMockApiError,
  isMockApiError,
  MOCK_ERROR_CODES,
  type MockApiError,
  type MockErrorCode,
  mockErrorHttpBody,
} from '@/mock/errors'
export { FailureController, type FailureEndpoint } from '@/mock/failure'
export { buildCreateVersionFingerprint } from '@/mock/idempotency/fingerprint'
export type {
  CompletedBulkAssignMutation,
  CompletedBulkRegenerateMutation,
  CompletedCreateVersionMutation,
  CompletedMutationRecord,
  IdempotencyBinding,
} from '@/mock/idempotency/types'
export {
  buildBulkAssignFingerprint,
  buildBulkRegenerateFingerprint,
} from '@/mock/idempotency/types'
export { LatencyController } from '@/mock/latency'
export {
  ACTOR_USER_ID_HEADER,
  ACTOR_USER_ROLE_HEADER,
  parseActorHeaders,
} from '@/mock/msw/actor-headers'
export { createMockBackendBrowserWorker } from '@/mock/msw/browser'
export { createMockBackendHandlers } from '@/mock/msw/handlers'
export { createMockBackendNodeServer } from '@/mock/msw/node'
export { createMulberry32, type DeterministicRandom } from '@/mock/prng'
export {
  createSeedConfig,
  DEFAULT_SEED_CONFIG,
  MAX_SEED_NOTE_COUNT,
  type SeedConfig,
  seedMockDatabase,
  type SeedResult,
} from '@/mock/seed/seed'
export {
  type ActorContext,
  DEFAULT_NOTES_LIST_LIMIT,
  type MockBackendOptions,
  MockBackendService,
} from '@/mock/services/backend'
export {
  createNoteVersion,
  type CreateVersionInput,
  type CreateVersionResult,
} from '@/mock/services/create-version'
export { transitionNote, type TransitionNoteInput } from '@/mock/services/transition'
