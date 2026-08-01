import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useEffectEvent, useRef, useSyncExternalStore } from 'react'

import { parseIsoDateTime } from '@/domain/datetime'
import type { NoteId, VersionId } from '@/domain/ids'
import { parseUserId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'
import {
  AUTOSAVE_DEBOUNCE_MS,
  type AutosaveStatus,
  type SaveSuccessEvent,
} from '@/features/note-detail/autosave/autosave.types'
import {
  AutosaveCoordinator,
  createAutosaveCoordinator,
} from '@/features/note-detail/autosave/autosave-coordinator'
import { autosaveNeedsNavigationGuard } from '@/features/note-detail/autosave/autosave-status'
import { reconcileDetailCacheAfterSave } from '@/features/note-detail/autosave/note-detail-cache'
import { isEditorDirty } from '@/features/note-detail/editor/soap-editor.selectors'
import type {
  SoapEditorAction,
  SoapEditorState,
} from '@/features/note-detail/editor/soap-editor.types'
import { buildCreateVersionFingerprint } from '@/mock/idempotency/fingerprint'
import { getActorIdentity } from '@/services/api/actor-provider'
import {
  type ClientMutationIdGenerator,
  createBrowserClientMutationIdGenerator,
} from '@/services/api/client-mutation-id'
import { createNoteVersion } from '@/services/api/create-version-api'
import { getConnectivityService } from '@/services/offline/connectivity'
import { getActiveReplayCoordinator } from '@/services/offline/offline-bootstrap'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'

export type UseNoteAutosaveOptions = {
  readonly enabled: boolean
  readonly noteId: NoteId | null
  readonly editorState: SoapEditorState | null
  readonly dispatch: (action: SoapEditorAction) => void
  readonly mutationIdGenerator?: ClientMutationIdGenerator
  readonly debounceMs?: number
}

export type UseNoteAutosaveResult = {
  readonly status: AutosaveStatus
  readonly retry: () => void
  readonly guardActive: boolean
  /** True when the latest write is durable in IndexedDB (not necessarily server-synced). */
  readonly locallyDurable: boolean
  readonly clearConflictResolved: (input: {
    readonly versionId: VersionId
    readonly content: SoapContent
  }) => void
  readonly replaceConflict: (
    conflict: import('@/domain/schemas/conflict').VersionConflictResponseDto,
  ) => void
  readonly restoreFromQueuedWrite: (input: {
    readonly queueId: string
    readonly mutationId: import('@/domain/ids').ClientMutationId
    readonly status: 'QUEUED' | 'REPLAYING' | 'FAILED' | 'BLOCKED_CONFLICT'
    readonly conflict?: import('@/domain/schemas/conflict').VersionConflictResponseDto | null
    readonly lastErrorCode?: string | null
  }) => void
  readonly applyReplaySuccess: (input: {
    readonly versionId: VersionId
    readonly content: SoapContent
    readonly mutationId: import('@/domain/ids').ClientMutationId
  }) => void
}

const CLEAN_STATUS: AutosaveStatus = { kind: 'CLEAN' }

type CoordinatorSessionStore = {
  coordinator: AutosaveCoordinator | null
  sessionKey: string | null
  version: number
  listeners: Set<() => void>
}

/**
 * Debounced autosave hook. Owns one note-scoped {@link AutosaveCoordinator} per edit session.
 * Debounce timers live here; request serialization lives in the coordinator (not React effects).
 */
export function useNoteAutosave(options: UseNoteAutosaveOptions): UseNoteAutosaveResult {
  const {
    enabled,
    noteId,
    editorState,
    dispatch,
    mutationIdGenerator,
    debounceMs = AUTOSAVE_DEBOUNCE_MS,
  } = options

  const queryClient = useQueryClient()
  const mountedRef = useRef(true)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generatorRef = useRef<ClientMutationIdGenerator>(
    mutationIdGenerator ?? createBrowserClientMutationIdGenerator(),
  )
  const sessionStoreRef = useRef<CoordinatorSessionStore>({
    coordinator: null,
    sessionKey: null,
    version: 0,
    listeners: new Set(),
  })

  const handleSuccess = useEffectEvent((event: SaveSuccessEvent) => {
    if (!mountedRef.current) {
      return
    }
    dispatch({
      type: 'ACKNOWLEDGE_SAVED_VERSION',
      baseVersionId: event.versionId,
      expectedBaseVersionId: event.intent.baseVersionId,
      savedContent: event.savedContent,
    })
    const actor = getActorIdentity()
    reconcileDetailCacheAfterSave(queryClient, {
      noteId: event.intent.noteId,
      versionId: event.versionId,
      revision: event.revision,
      parentVersionId: event.parentVersionId,
      savedContent: event.savedContent,
      authorId: parseUserId(actor.userId),
      authorRole: actor.role,
    })
  })

  useEffect(() => {
    if (mutationIdGenerator) {
      generatorRef.current = mutationIdGenerator
    }
  }, [mutationIdGenerator])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const sessionKey = enabled && noteId !== null ? String(noteId) : null

  useEffect(() => {
    const store = sessionStoreRef.current
    store.coordinator?.dispose({ abortInFlight: true })
    store.coordinator = null

    if (sessionKey !== null && noteId !== null) {
      store.coordinator = createAutosaveCoordinator({
        transport: {
          async save(intent, signal) {
            const result = await createNoteVersion(
              {
                noteId: intent.noteId,
                baseVersionId: intent.baseVersionId,
                content: intent.content,
                clientMutationId: intent.clientMutationId,
              },
              { signal },
            )
            return {
              versionId: result.version.id,
              revision: result.version.revision,
              parentVersionId: result.version.parentVersionId,
              savedContent: result.savedContent,
            }
          },
        },
        nextMutationId: () => generatorRef.current.next(),
        onSuccess: (event) => {
          handleSuccess(event)
        },
        isOffline: () => getConnectivityService().getSnapshot().kind === 'OFFLINE',
        persistOfflineWrite: async (intent) => {
          const actor = getActorIdentity()
          const fingerprint = buildCreateVersionFingerprint({
            noteId: intent.noteId,
            baseVersionId: intent.baseVersionId,
            content: intent.content,
            actorUserId: parseUserId(actor.userId),
          })
          const repo = createQueuedWriteRepository()
          const entry = await repo.coalesceUnsentForNote({
            noteId: intent.noteId,
            baseVersionId: intent.baseVersionId,
            content: intent.content,
            clientMutationId: intent.clientMutationId,
            fingerprint,
            createdAt: parseIsoDateTime(new Date().toISOString()),
          })
          const connectivity = getConnectivityService()
          const kind = connectivity.getSnapshot().kind
          // Honor an explicit OFFLINE state (window offline event). Only use
          // DEGRADED + immediate replay when the browser still reports online —
          // that recovers from false "offline" stalls after request failures.
          if (kind === 'OFFLINE') {
            // Keep OFFLINE; do not force replay while intentionally offline.
          } else if (typeof navigator !== 'undefined' && navigator.onLine) {
            connectivity.markDegraded('Network error — changes saved on this device.')
            void getActiveReplayCoordinator()?.replayNow()
          } else {
            connectivity.markOffline()
          }
          return {
            queueId: entry.id,
            clientMutationId: entry.clientMutationId,
          }
        },
      })
    }

    store.sessionKey = sessionKey
    store.version += 1
    for (const listener of store.listeners) {
      listener()
    }

    return () => {
      store.coordinator?.dispose({ abortInFlight: true })
      store.coordinator = null
      store.sessionKey = null
      store.version += 1
      for (const listener of store.listeners) {
        listener()
      }
    }
  }, [sessionKey, noteId])

  const sessionVersion = useSyncExternalStore(
    (listener) => {
      const store = sessionStoreRef.current
      store.listeners.add(listener)
      return () => {
        store.listeners.delete(listener)
      }
    },
    () => sessionStoreRef.current.version,
    () => 0,
  )

  const status = useSyncExternalStore(
    (listener) => {
      const store = sessionStoreRef.current
      const active = store.coordinator
      if (!active) {
        // Still resubscribe when session version changes via store.listeners.
        store.listeners.add(listener)
        return () => {
          store.listeners.delete(listener)
        }
      }
      const unsubscribeCoordinator = active.subscribe(listener)
      store.listeners.add(listener)
      return () => {
        unsubscribeCoordinator()
        store.listeners.delete(listener)
      }
    },
    () => {
      const active = sessionStoreRef.current.coordinator
      return active ? active.getSnapshot() : CLEAN_STATUS
    },
    () => CLEAN_STATUS,
  )

  // Touch sessionVersion so status re-subscribes when the coordinator instance changes.
  void sessionVersion

  const clearDebounceTimer = () => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }

  const flushDebouncedSave = useEffectEvent((content: SoapContent, baseVersionId: VersionId) => {
    const active = sessionStoreRef.current.coordinator
    if (!active || noteId === null) {
      return
    }
    active.enqueueLatest({
      noteId,
      baseVersionId,
      content,
    })
  })

  const dirty = editorState !== null && isEditorDirty(editorState)
  const paused =
    status.kind === 'CONFLICT' ||
    status.kind === 'BLOCKED_CONFLICT' ||
    status.kind === 'ERROR' ||
    !enabled ||
    noteId === null

  // While already offline-durable, flush coalesces immediately so later keystrokes
  // do not sit only in React memory with navigation unguarded.
  const effectiveDebounceMs =
    status.kind === 'QUEUED_OFFLINE' || status.kind === 'REPLAYING' || status.kind === 'SYNC_FAILED'
      ? 0
      : debounceMs

  useEffect(() => {
    const active = sessionStoreRef.current.coordinator
    if (!active) {
      clearDebounceTimer()
      return
    }

    if (paused || editorState === null) {
      clearDebounceTimer()
      if (!enabled) {
        active.cancelPending()
      }
      return
    }

    if (!dirty) {
      clearDebounceTimer()
      active.markClean()
      return
    }

    const draft = editorState.draftContent
    const baseVersionId = editorState.baseVersionId
    active.setDebouncing()
    clearDebounceTimer()
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null
      flushDebouncedSave(draft, baseVersionId)
    }, effectiveDebounceMs)

    return () => {
      clearDebounceTimer()
    }
  }, [effectiveDebounceMs, dirty, editorState, enabled, noteId, paused, sessionVersion])

  useEffect(() => {
    return () => {
      clearDebounceTimer()
    }
  }, [])

  const retry = () => {
    const active = sessionStoreRef.current.coordinator
    if (!active) {
      return
    }
    if (active.getSnapshot().kind === 'SYNC_FAILED' && noteId !== null) {
      void createQueuedWriteRepository()
        .listByNote(noteId)
        .then(async (rows) => {
          const repo = createQueuedWriteRepository()
          for (const row of rows) {
            if (row.status === 'FAILED') {
              await repo.markQueuedForRetry(row.id, {
                errorCode: row.lastErrorCode ?? 'RETRY',
                retryCount: 0,
              })
            }
          }
          void getActiveReplayCoordinator()?.replayNow()
        })
      return
    }
    active.retry()
  }

  const clearConflictResolved = (input: {
    readonly versionId: VersionId
    readonly content: SoapContent
  }) => {
    sessionStoreRef.current.coordinator?.clearConflictResolved(input)
  }

  const replaceConflict = (
    conflict: import('@/domain/schemas/conflict').VersionConflictResponseDto,
  ) => {
    sessionStoreRef.current.coordinator?.replaceConflict(conflict)
  }

  const restoreFromQueuedWrite = (input: {
    readonly queueId: string
    readonly mutationId: import('@/domain/ids').ClientMutationId
    readonly status: 'QUEUED' | 'REPLAYING' | 'FAILED' | 'BLOCKED_CONFLICT'
    readonly conflict?: import('@/domain/schemas/conflict').VersionConflictResponseDto | null
    readonly lastErrorCode?: string | null
  }) => {
    sessionStoreRef.current.coordinator?.restoreFromQueuedWrite(input)
  }

  const applyReplaySuccess = (input: {
    readonly versionId: VersionId
    readonly content: SoapContent
    readonly mutationId: import('@/domain/ids').ClientMutationId
  }) => {
    sessionStoreRef.current.coordinator?.applyReplaySuccess(input)
  }

  const locallyDurable =
    (status.kind === 'QUEUED_OFFLINE' ||
      status.kind === 'REPLAYING' ||
      status.kind === 'SYNC_FAILED') &&
    // Newer edits not yet flushed to the queue remain non-durable for navigation.
    !dirty
  const guardActive = locallyDurable ? false : dirty || autosaveNeedsNavigationGuard(status)

  return {
    status,
    retry,
    guardActive,
    locallyDurable,
    clearConflictResolved,
    replaceConflict,
    restoreFromQueuedWrite,
    applyReplaySuccess,
  }
}
