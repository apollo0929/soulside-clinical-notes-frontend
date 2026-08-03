import type { QueryClient } from '@tanstack/react-query'

import type { SessionId } from '@/domain/ids'
import { parseUserId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteSummaryRealtimeDto, RealtimeEventDto } from '@/domain/schemas/realtime'
import type { NotesInfiniteData } from '@/features/notes-list/notes-list-cache'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
import { getActiveMockRealtimeServer } from '@/mock/realtime/active-server'
import { getActorHeaders, getActorIdentity } from '@/services/api/actor-provider'
import {
  ConnectivityService,
  getConnectivityService,
  resetConnectivityServiceForTests,
} from '@/services/offline/connectivity'
import { persistNoteDetailToOfflineCache } from '@/services/offline/offline-bootstrap'
import { InProcessRealtimeTransport } from '@/services/realtime/in-process-transport'
import { SseRealtimeTransport } from '@/services/realtime/mock-sse-transport'
import {
  getMutationCorrelationStore,
  isLocalMutation,
  type MutationCorrelationStore,
  rememberLocalMutation,
  resetMutationCorrelationForTests,
} from '@/services/realtime/mutation-correlation'
import { isPresenceEvent, PresenceStore } from '@/services/realtime/presence'
import {
  clearPresenceSessionIdForTests,
  getOrCreatePresenceSessionId,
} from '@/services/realtime/presence-session'
import {
  clearPersistedLastEventId,
  createRealtimeCoordinator,
  type RealtimeCoordinator,
  type RealtimeScheduler,
} from '@/services/realtime/realtime-coordinator'
import {
  applyNoteSummaryToListCache,
  applyStatusOrReviewerToDetail,
  applyVersionCreatedToDetail,
  shouldInvalidateListForMembershipChange,
} from '@/services/realtime/realtime-reconciliation'
import type { RealtimeTransport } from '@/services/realtime/realtime-transport'

export type RealtimeBootstrapDeps = {
  readonly connectivity?: ConnectivityService
  readonly transport?: RealtimeTransport
  readonly getActorHeaders?: () => Record<string, string>
  readonly sessionId?: SessionId
  readonly scheduler?: RealtimeScheduler
  readonly mutationCorrelation?: MutationCorrelationStore
  readonly presenceStore?: PresenceStore
}

let bootstrapPromise: Promise<RealtimeCoordinator> | null = null
let activeCoordinator: RealtimeCoordinator | null = null
let activePresence: PresenceStore | null = null
let bootstrapEpoch = 0
const coordinatorReadyListeners = new Set<() => void>()

function notifyCoordinatorReady(): void {
  for (const listener of coordinatorReadyListeners) {
    listener()
  }
}

export function subscribeRealtimeCoordinatorReady(listener: () => void): () => void {
  coordinatorReadyListeners.add(listener)
  if (activeCoordinator && !activeCoordinator.isDisposed()) {
    queueMicrotask(() => {
      if (activeCoordinator && !activeCoordinator.isDisposed()) {
        listener()
      }
    })
  }
  return () => {
    coordinatorReadyListeners.delete(listener)
  }
}

/** Test helper: current ready-listener count (detects listener leaks across resets). */
export function getRealtimeCoordinatorReadyListenerCountForTests(): number {
  return coordinatorReadyListeners.size
}

function resolveTransport(deps: RealtimeBootstrapDeps): RealtimeTransport {
  if (deps.transport) {
    return deps.transport
  }
  // Prefer SSE in the browser so multiple tabs share the MSW-backed realtime server.
  // In-process is for Vitest/jsdom (no EventSource) against a registered mock server.
  if (typeof EventSource === 'undefined') {
    const mockServer = getActiveMockRealtimeServer()
    if (mockServer) {
      return new InProcessRealtimeTransport({
        server: mockServer,
        getActor: () => {
          const actor = getActorIdentity()
          return {
            userId: parseUserId(actor.userId),
            role: actor.role,
          }
        },
      })
    }
  }
  return new SseRealtimeTransport()
}

function extractSummary(event: RealtimeEventDto): NoteSummaryRealtimeDto | null {
  switch (event.eventType) {
    case 'NOTE_CREATED':
    case 'NOTE_UPDATED':
      return event.summary
    case 'NOTE_VERSION_CREATED':
      return event.summary
    case 'NOTE_STATUS_CHANGED':
    case 'NOTE_REVIEWER_CHANGED':
      return event.summary
    default:
      return null
  }
}

function patchListCaches(queryClient: QueryClient, summary: NoteSummaryRealtimeDto): void {
  const queries = queryClient.getQueriesData<NotesInfiniteData>({ queryKey: notesKeys.lists() })
  for (const [key, data] of queries) {
    if (!data) {
      continue
    }
    queryClient.setQueryData(key, applyNoteSummaryToListCache(data, summary))
  }
}

export function reconcileRealtimeEvent(queryClient: QueryClient, event: RealtimeEventDto): void {
  if (event.eventType === 'NOTE_VERSION_CREATED') {
    const mutationId = event.originatingClientMutationId
    if ((mutationId !== null && isLocalMutation(mutationId)) || isLocalMutation(event.versionId)) {
      // Local save already reconciled the cache; skip echo to avoid false dirty warnings
      // and stale SOAP content from metadata-only version patches.
      return
    }
  }

  if (shouldInvalidateListForMembershipChange(event)) {
    void queryClient.invalidateQueries({ queryKey: notesKeys.lists() })
  }

  const summary = extractSummary(event)
  if (summary) {
    patchListCaches(queryClient, summary)
  }

  if (!('noteId' in event) || event.noteId === null) {
    return
  }

  const noteId = event.noteId
  const detailKey = notesKeys.detail(noteId)
  const cached = queryClient.getQueryData<NoteDetailAggregate>(detailKey)

  switch (event.eventType) {
    case 'NOTE_VERSION_CREATED': {
      if (cached) {
        const next = applyVersionCreatedToDetail(cached, event)
        if (next) {
          queryClient.setQueryData(detailKey, next)
          void persistNoteDetailToOfflineCache(noteId, next)
        }
      }
      // Soft invalidate only. An active refetch can overwrite a patched remote head
      // with a lagging REST snapshot and clear dirty-editor newer-version warnings.
      // SOAP content is loaded on the next safe detail fetch (clean editor / remount).
      void queryClient.invalidateQueries({ queryKey: detailKey, refetchType: 'none' })
      return
    }
    case 'NOTE_STATUS_CHANGED':
    case 'NOTE_REVIEWER_CHANGED': {
      if (cached) {
        const next = applyStatusOrReviewerToDetail(cached, event)
        queryClient.setQueryData(detailKey, next)
        void persistNoteDetailToOfflineCache(noteId, next)
      }
      return
    }
    case 'NOTE_DELETED': {
      void queryClient.invalidateQueries({ queryKey: detailKey, refetchType: 'active' })
      return
    }
    default:
      return
  }
}

/**
 * Idempotent realtime bootstrap. Safe under React Strict Mode double invocation.
 */
export function ensureRealtimeBootstrap(
  queryClient: QueryClient,
  deps: RealtimeBootstrapDeps = {},
): Promise<RealtimeCoordinator> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  const epoch = bootstrapEpoch
  bootstrapPromise = Promise.resolve().then(() => {
    if (epoch !== bootstrapEpoch) {
      throw new Error('Realtime bootstrap cancelled')
    }

    const connectivity = deps.connectivity ?? getConnectivityService()
    connectivity.start()

    if (activeCoordinator) {
      activeCoordinator.dispose()
    }

    const presence =
      deps.presenceStore ?? new PresenceStore(deps.sessionId ?? getOrCreatePresenceSessionId())
    activePresence = presence

    const coordinator = createRealtimeCoordinator({
      transport: resolveTransport(deps),
      connectivity,
      ...(deps.scheduler ? { scheduler: deps.scheduler } : {}),
      getActorHeaders: deps.getActorHeaders ?? getActorHeaders,
      handlers: {
        onReconcile: (event) => {
          reconcileRealtimeEvent(queryClient, event)
        },
        onPresence: (event) => {
          if (presence && isPresenceEvent(event)) {
            presence.applyPresenceEvent(event)
          }
        },
        onResync: () => {
          void queryClient.invalidateQueries({ queryKey: notesKeys.all })
          void import('@/services/telemetry').then(
            ({ createRealtimeResyncRequiredEvent, trackTelemetry }) => {
              const kind = connectivity.getSnapshot().kind
              trackTelemetry((ctx) =>
                createRealtimeResyncRequiredEvent(ctx, { connectivityState: kind }),
              )
            },
          )
        },
      },
    })

    if (epoch !== bootstrapEpoch) {
      coordinator.dispose()
      throw new Error('Realtime bootstrap cancelled')
    }

    activeCoordinator = coordinator
    notifyCoordinatorReady()
    coordinator.start()

    let sawConnected = false
    coordinator.subscribeConnectionState((state) => {
      if (state !== 'CONNECTED') {
        return
      }
      void import('@/services/telemetry').then(
        ({ createRealtimeConnectedEvent, createRealtimeReconnectedEvent, trackTelemetry }) => {
          const kind = connectivity.getSnapshot().kind
          if (!sawConnected) {
            sawConnected = true
            trackTelemetry((ctx) => createRealtimeConnectedEvent(ctx, { connectivityState: kind }))
            return
          }
          trackTelemetry((ctx) => createRealtimeReconnectedEvent(ctx, { connectivityState: kind }))
        },
      )
    })

    return coordinator
  })

  return bootstrapPromise.catch((error) => {
    bootstrapPromise = null
    if (error instanceof Error && error.message === 'Realtime bootstrap cancelled') {
      const coordinator = createRealtimeCoordinator({
        transport: resolveTransport(deps),
        connectivity: deps.connectivity ?? getConnectivityService(),
        handlers: {
          onReconcile: () => undefined,
          onPresence: () => undefined,
          onResync: () => undefined,
        },
      })
      coordinator.dispose()
      return coordinator
    }
    throw error
  })
}

export function getActiveRealtimeCoordinator(): RealtimeCoordinator | null {
  if (activeCoordinator?.isDisposed()) {
    return null
  }
  return activeCoordinator
}

export function getActivePresenceStore(): PresenceStore | null {
  return activePresence
}

export { rememberLocalMutation as registerLocalMutation }

/**
 * Dispose the app-scoped realtime coordinator and clear bootstrap latches.
 * Does not return a disposed coordinator as "ready".
 */
export function resetRealtimeBootstrapForTests(): void {
  bootstrapEpoch += 1
  const previous = activeCoordinator
  activeCoordinator = null
  activePresence = null
  bootstrapPromise = null
  previous?.dispose()
  resetMutationCorrelationForTests()
  clearPersistedLastEventId()
  // Wake listeners so UI unbinds the disposed instance, then drop them so resets
  // do not accumulate subscribeRealtimeCoordinatorReady callbacks.
  notifyCoordinatorReady()
  coordinatorReadyListeners.clear()
}

/**
 * Full test isolation reset for realtime + related singletons.
 * Safe to call from Playwright via `__SOULSIDE_REALTIME__.resetEnvironment`.
 */
export function resetRealtimeEnvironmentForTests(): void {
  resetRealtimeBootstrapForTests()

  const server = getActiveMockRealtimeServer()
  server?.clearForTests()

  resetConnectivityServiceForTests()
  const connectivity = getConnectivityService()
  connectivity.start()
  if (connectivity.getSnapshot().kind !== 'ONLINE') {
    connectivity.markOnline()
  }

  try {
    clearPresenceSessionIdForTests()
  } catch {
    // private mode / unavailable
  }
}

export function getSharedMutationCorrelationStore(): MutationCorrelationStore {
  return getMutationCorrelationStore()
}
