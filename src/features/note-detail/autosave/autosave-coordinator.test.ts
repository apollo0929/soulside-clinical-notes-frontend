import { describe, expect, it, vi } from 'vitest'

import { parseClientMutationId, parseNoteId, parseUserId, parseVersionId } from '@/domain/ids'
import type {
  CreateVersionTransport,
  SaveIntent,
} from '@/features/note-detail/autosave/autosave.types'
import { AutosaveCoordinator } from '@/features/note-detail/autosave/autosave-coordinator'
import { ApiClientError, NetworkApiError } from '@/services/api/api-errors'
import { createDeterministicClientMutationIdGenerator } from '@/services/api/client-mutation-id'
import { VersionConflictApiError } from '@/services/api/create-version-api'
import { buildSoapContent } from '@/test/fixtures/domain'

const noteId = parseNoteId('note_autosave_1')
const version1 = parseVersionId('ver_1')
const version2 = parseVersionId('ver_2')
const version3 = parseVersionId('ver_3')

function content(label: string) {
  return buildSoapContent({ subjective: label })
}

function createCoordinator(options: {
  transport: CreateVersionTransport
  onSuccess?: (event: { intent: SaveIntent; versionId: typeof version1 }) => void
}) {
  const gen = createDeterministicClientMutationIdGenerator()
  return new AutosaveCoordinator({
    transport: options.transport,
    nextMutationId: () => gen.next(),
    onSuccess: (event) => {
      options.onSuccess?.(event)
    },
  })
}

describe('AutosaveCoordinator serialization', () => {
  it('7–8: first enqueue starts one request; no concurrent second request', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const started: string[] = []
    let release!: (value: {
      versionId: typeof version2
      revision: number
      parentVersionId: typeof version1
      savedContent: ReturnType<typeof content>
    }) => void
    const gate = new Promise<Parameters<typeof release>[0]>((resolve) => {
      release = resolve
    })

    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          started.push(intent.content.subjective)
          const result = await gate
          inFlight -= 1
          return result
        },
      },
    })

    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('A') })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('B') })
    expect(started).toEqual(['A'])
    expect(maxInFlight).toBe(1)
    expect(coordinator.getSnapshot().kind).toBe('QUEUED')

    release({
      versionId: version2,
      revision: 2,
      parentVersionId: version1,
      savedContent: content('A'),
    })
    await vi.waitFor(() => {
      expect(started).toEqual(['A', 'B'])
    })
    expect(maxInFlight).toBe(1)
  })

  it('9–14: coalesced follow-up uses latest content, new base, new mutation id; skips equal content', async () => {
    const intents: SaveIntent[] = []
    const releases: Array<() => void> = []

    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          intents.push(intent)
          await new Promise<void>((resolve) => {
            releases.push(resolve)
          })
          return {
            versionId: intents.length === 1 ? version2 : version3,
            revision: intents.length === 1 ? 2 : 3,
            parentVersionId: intent.baseVersionId,
            savedContent: intent.content,
          }
        },
      },
    })

    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('A') })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('B1') })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('B2') })
    expect(intents).toHaveLength(1)

    releases[0]!()
    await vi.waitFor(() => {
      expect(intents).toHaveLength(2)
    })
    expect(intents[1]!.content.subjective).toBe('B2')
    expect(intents[1]!.baseVersionId).toBe(version2)
    expect(intents[1]!.clientMutationId).toBe(parseClientMutationId('mut_test_2'))
    expect(intents[0]!.clientMutationId).toBe(parseClientMutationId('mut_test_1'))

    releases[1]!()
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('SAVED')
    })

    // Equal to last saved — no follow-up.
    const before = intents.length
    coordinator.enqueueLatest({ noteId, baseVersionId: version3, content: content('B2') })
    expect(intents).toHaveLength(before)
    expect(coordinator.getSnapshot().kind).toBe('CLEAN')
  })

  it('15–18: success advances base; cloned input is frozen; snapshots are stable kinds', async () => {
    const source = content('immutable')
    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          expect(Object.isFrozen(intent.content)).toBe(true)
          return {
            versionId: version2,
            revision: 2,
            parentVersionId: version1,
            savedContent: content('immutable'),
          }
        },
      },
    })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: source })
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('SAVED')
    })
    expect(source.subjective).toBe('immutable')
    const snap = coordinator.getSnapshot()
    expect(snap).toEqual({ kind: 'SAVED', versionId: version2 })
  })

  it('52–55,61–66: classifies network/500/403/validation/conflict; conflict drops queue', async () => {
    const cases: Array<{
      error: unknown
      expectKind: string
      retryable?: boolean
    }> = [
      { error: new NetworkApiError({ message: 'offline' }), expectKind: 'ERROR', retryable: true },
      {
        error: new ApiClientError({ status: 500, code: 'X', message: 'boom' }),
        expectKind: 'ERROR',
        retryable: true,
      },
      {
        error: new ApiClientError({ status: 403, code: 'FORBIDDEN', message: 'no' }),
        expectKind: 'ERROR',
        retryable: false,
      },
      {
        error: new ApiClientError({ status: 400, code: 'INVALID', message: 'bad' }),
        expectKind: 'ERROR',
        retryable: false,
      },
    ]

    for (const testCase of cases) {
      const coordinator = createCoordinator({
        transport: {
          async save() {
            throw testCase.error
          },
        },
      })
      coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('x') })
      await vi.waitFor(() => {
        expect(coordinator.getSnapshot().kind).toBe(testCase.expectKind)
      })
      const status = coordinator.getSnapshot()
      if (status.kind === 'ERROR') {
        expect(status.retryable).toBe(testCase.retryable)
      }
    }

    let resolveConflict!: () => void
    const conflictGate = new Promise<void>((resolve) => {
      resolveConflict = resolve
    })
    const intents: string[] = []
    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          intents.push(intent.content.subjective)
          await conflictGate
          throw new VersionConflictApiError({
            error: 'version_conflict',
            current: {
              id: version2,
              revision: 2,
              authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
            },
            commonAncestor: {
              id: version1,
              revision: 1,
            },
          })
        },
      },
    })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('A') })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('queued') })
    resolveConflict()
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('CONFLICT')
    })
    expect(intents).toEqual(['A'])
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('more') })
    expect(intents).toEqual(['A'])
  })

  it('57–60: retry reuses mutation id; duplicate retry does not double-start', async () => {
    let attempts = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const mutationIds: string[] = []
    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          attempts += 1
          mutationIds.push(String(intent.clientMutationId))
          if (attempts === 1) {
            throw new NetworkApiError({ message: 'fail' })
          }
          await gate
          return {
            versionId: version2,
            revision: 2,
            parentVersionId: version1,
            savedContent: intent.content,
          }
        },
      },
    })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('A') })
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('ERROR')
    })
    coordinator.retry()
    coordinator.retry()
    expect(attempts).toBe(2)
    expect(mutationIds[0]).toBe(mutationIds[1])
    release()
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('SAVED')
    })
  })

  it('type-during-save: exactly one follow-up with latest content and advanced base', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const intents: SaveIntent[] = []
    const releases: Array<() => void> = []

    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          inFlight += 1
          maxInFlight = Math.max(maxInFlight, inFlight)
          intents.push(intent)
          await new Promise<void>((resolve) => {
            releases.push(resolve)
          })
          inFlight -= 1
          return {
            versionId: intents.length === 1 ? version2 : version3,
            revision: intents.length === 1 ? 2 : 3,
            parentVersionId: intent.baseVersionId,
            savedContent: intent.content,
          }
        },
      },
    })

    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('A') })
    // Simulate typing while A is in flight — only the latest coalesced draft is kept.
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('B-temp') })
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('B-final') })
    expect(intents).toHaveLength(1)
    expect(maxInFlight).toBe(1)

    releases[0]!()
    await vi.waitFor(() => {
      expect(intents).toHaveLength(2)
    })
    expect(maxInFlight).toBe(1)
    expect(intents[1]!.content.subjective).toBe('B-final')
    expect(intents[1]!.baseVersionId).toBe(version2)
    expect(intents[1]!.clientMutationId).not.toBe(intents[0]!.clientMutationId)

    releases[1]!()
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('SAVED')
    })
    expect(intents).toHaveLength(2)
  })

  it('retry then queued draft: failed mutation id reused; follow-up gets a new id', async () => {
    const intents: SaveIntent[] = []
    let attempt = 0
    const coordinator = createCoordinator({
      transport: {
        async save(intent) {
          attempt += 1
          intents.push(intent)
          if (attempt === 1) {
            throw new NetworkApiError({ message: 'fail' })
          }
          return {
            versionId: attempt === 2 ? version2 : version3,
            revision: attempt === 2 ? 2 : 3,
            parentVersionId: intent.baseVersionId,
            savedContent: intent.content,
          }
        },
      },
    })

    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('A') })
    await vi.waitFor(() => {
      expect(coordinator.getSnapshot().kind).toBe('ERROR')
    })
    // Newer draft while ERROR must not start a concurrent save or new mutation id.
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('B') })
    expect(intents).toHaveLength(1)

    coordinator.retry()
    await vi.waitFor(() => {
      expect(intents).toHaveLength(2)
    })
    expect(intents[1]!.clientMutationId).toBe(intents[0]!.clientMutationId)
    expect(intents[1]!.content.subjective).toBe('A')

    await vi.waitFor(() => {
      expect(intents).toHaveLength(3)
    })
    expect(intents[2]!.content.subjective).toBe('B')
    expect(intents[2]!.baseVersionId).toBe(version2)
    expect(intents[2]!.clientMutationId).not.toBe(intents[0]!.clientMutationId)
    expect(coordinator.getSnapshot().kind).toBe('SAVED')
  })

  it('73–75: dispose clears listeners and aborts; abort is not ERROR', async () => {
    const listener = vi.fn()
    let sawAbort = false
    const coordinator = createCoordinator({
      transport: {
        async save(_intent, signal) {
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              sawAbort = true
              reject(new DOMException('Aborted', 'AbortError'))
            })
          })
          return {
            versionId: version2,
            revision: 2,
            parentVersionId: version1,
            savedContent: content('x'),
          }
        },
      },
    })
    const unsubscribe = coordinator.subscribe(listener)
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('x') })
    coordinator.dispose({ abortInFlight: true })
    await vi.waitFor(() => {
      expect(sawAbort).toBe(true)
    })
    expect(coordinator.getSnapshot().kind).not.toBe('ERROR')
    unsubscribe()
    listener.mockClear()
    // Disposed coordinator ignores further enqueue.
    coordinator.enqueueLatest({ noteId, baseVersionId: version1, content: content('y') })
    expect(listener).not.toHaveBeenCalled()
  })
})
