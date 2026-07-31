import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useReducer, useRef, useState } from 'react'

import type { ClientMutationId, NoteId, VersionId } from '@/domain/ids'
import { parseUserId } from '@/domain/ids'
import { cloneSoapContent, type SoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'
import { reconcileDetailCacheAfterSave } from '@/features/note-detail/autosave/note-detail-cache'
import type {
  ConflictResolutionAction,
  ConflictResolutionSession,
  ConflictResolutionState,
} from '@/features/note-detail/conflict/conflict.types'
import {
  conflictResolutionReducer,
  createInitialConflictResolutionState,
} from '@/features/note-detail/conflict/conflict-resolution.reducer'
import {
  buildResolvedSoapContent,
  getUnresolvedConflictCount,
  isConflictSessionResolved,
} from '@/features/note-detail/conflict/conflict-selectors'
import { useConflictHydration } from '@/features/note-detail/conflict/use-conflict-hydration'
import { getActorIdentity } from '@/services/api/actor-provider'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import {
  type ClientMutationIdGenerator,
  createBrowserClientMutationIdGenerator,
} from '@/services/api/client-mutation-id'
import { createNoteVersion, isVersionConflictApiError } from '@/services/api/create-version-api'

export type ConflictLocalSnapshot = {
  readonly noteId: NoteId
  readonly localBaseVersionId: VersionId
  readonly localContent: SoapContent
}

export type UseConflictResolutionOptions = {
  readonly active: boolean
  readonly snapshot: ConflictLocalSnapshot | null
  readonly conflict: VersionConflictResponseDto | null
  readonly mutationIdGenerator?: ClientMutationIdGenerator
  readonly onResolved: (input: {
    readonly versionId: VersionId
    readonly revision: number
    readonly parentVersionId: VersionId
    readonly content: SoapContent
  }) => void
  readonly onRepeatedConflict: (
    conflict: VersionConflictResponseDto,
    localContent: SoapContent,
    attemptedBaseVersionId: VersionId,
  ) => void
}

export type ConflictSaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'success' }
  | {
      readonly kind: 'error'
      readonly message: string
      readonly retryable: boolean
    }

export type UseConflictResolutionResult = {
  readonly hydration: ReturnType<typeof useConflictHydration>
  readonly resolution: ConflictResolutionState | null
  readonly dispatch: (action: ConflictResolutionAction) => void
  readonly unresolvedCount: number
  readonly canSubmit: boolean
  readonly saveStatus: ConflictSaveStatus
  readonly submit: () => void
  readonly retrySave: () => void
  readonly session: ConflictResolutionSession | null
}

type PendingSave = {
  readonly mutationId: ClientMutationId
  readonly content: SoapContent
  readonly baseVersionId: VersionId
  readonly noteId: NoteId
}

type BoundAction =
  ConflictResolutionAction | { readonly type: 'BIND'; readonly session: ConflictResolutionSession }

function boundReducer(
  state: ConflictResolutionState | null,
  action: BoundAction,
): ConflictResolutionState | null {
  if (action.type === 'BIND') {
    return createInitialConflictResolutionState(action.session)
  }
  if (state === null) {
    return state
  }
  return conflictResolutionReducer(state, action)
}

const IDLE_NOTE = 'note_conflict_idle' as NoteId
const IDLE_VERSION = 'ver_conflict_idle' as VersionId
const IDLE_ANCESTOR = 'ver_conflict_idle_ancestor' as VersionId
const IDLE_CONTENT: SoapContent = Object.freeze({
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
})

/**
 * Orchestrates conflict hydration, section resolution, and resolved create-version save.
 *
 * Retry of the same failed resolved request reuses the pending clientMutationId.
 * Changing a resolution after failure clears the pending request so the next
 * submit generates a new clientMutationId.
 */
export function useConflictResolution(
  options: UseConflictResolutionOptions,
): UseConflictResolutionResult {
  const { active, snapshot, conflict, mutationIdGenerator, onResolved, onRepeatedConflict } =
    options

  const queryClient = useQueryClient()
  const generatorRef = useRef(mutationIdGenerator ?? createBrowserClientMutationIdGenerator())
  const mountedRef = useRef(true)
  const pendingSaveRef = useRef<PendingSave | null>(null)
  const savingGateRef = useRef(false)
  const onResolvedRef = useRef(onResolved)
  const onRepeatedConflictRef = useRef(onRepeatedConflict)
  const [saveStatus, setSaveStatus] = useState<ConflictSaveStatus>({ kind: 'idle' })
  const [boundState, boundDispatch] = useReducer(boundReducer, null)
  const [boundSessionKey, setBoundSessionKey] = useState<string | null>(null)

  useEffect(() => {
    onResolvedRef.current = onResolved
    onRepeatedConflictRef.current = onRepeatedConflict
  }, [onResolved, onRepeatedConflict])

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

  const hydrationEnabled = Boolean(active && snapshot && conflict)
  const hydration = useConflictHydration({
    enabled: hydrationEnabled,
    noteId: snapshot?.noteId ?? IDLE_NOTE,
    localBaseVersionId: snapshot?.localBaseVersionId ?? IDLE_VERSION,
    localContent: snapshot?.localContent ?? IDLE_CONTENT,
    conflict: conflict ?? {
      error: 'version_conflict',
      current: {
        id: IDLE_VERSION,
        revision: 1,
        authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
      },
      commonAncestor: {
        id: IDLE_ANCESTOR,
        revision: 1,
      },
    },
  })

  const session = hydrationEnabled && hydration.kind === 'ready' ? hydration.session : null
  const sessionBindKey = session
    ? `${session.noteId}:${session.localBaseVersionId}:${session.serverHeadVersionId}:${session.commonAncestorVersionId}`
    : null

  // Adjust resolution state during render when a new hydrated session arrives.
  if (session && sessionBindKey && sessionBindKey !== boundSessionKey) {
    boundDispatch({ type: 'BIND', session })
    setBoundSessionKey(sessionBindKey)
    if (saveStatus.kind !== 'idle') {
      setSaveStatus({ kind: 'idle' })
    }
  } else if (!session && boundSessionKey !== null) {
    setBoundSessionKey(null)
  }

  useEffect(() => {
    pendingSaveRef.current = null
    savingGateRef.current = false
  }, [boundSessionKey])

  // Never pair a newly hydrated session with a previous session's resolution map.
  const sessionMatched =
    session !== null &&
    sessionBindKey !== null &&
    boundSessionKey === sessionBindKey &&
    boundState !== null
  const activeResolution = sessionMatched ? boundState : null
  const unresolvedCount = activeResolution ? getUnresolvedConflictCount(activeResolution) : 0
  const canSubmit =
    hydrationEnabled &&
    activeResolution !== null &&
    isConflictSessionResolved(activeResolution) &&
    saveStatus.kind !== 'saving'

  const runSave = async (pending: PendingSave) => {
    if (savingGateRef.current) {
      return
    }
    savingGateRef.current = true
    setSaveStatus({ kind: 'saving' })
    try {
      const result = await createNoteVersion({
        noteId: pending.noteId,
        baseVersionId: pending.baseVersionId,
        content: pending.content,
        clientMutationId: pending.mutationId,
      })
      if (!mountedRef.current) {
        return
      }
      const actor = getActorIdentity()
      reconcileDetailCacheAfterSave(queryClient, {
        noteId: pending.noteId,
        versionId: result.version.id,
        revision: result.version.revision,
        parentVersionId: result.version.parentVersionId,
        savedContent: result.savedContent,
        authorId: parseUserId(actor.userId),
        authorRole: actor.role,
      })
      pendingSaveRef.current = null
      savingGateRef.current = false
      setSaveStatus({ kind: 'success' })
      onResolvedRef.current({
        versionId: result.version.id,
        revision: result.version.revision,
        parentVersionId: result.version.parentVersionId,
        content: result.savedContent,
      })
    } catch (error) {
      if (!mountedRef.current) {
        return
      }
      savingGateRef.current = false
      if (isVersionConflictApiError(error)) {
        pendingSaveRef.current = null
        setSaveStatus({ kind: 'idle' })
        onRepeatedConflictRef.current(
          error.conflict,
          cloneSoapContent(pending.content),
          pending.baseVersionId,
        )
        return
      }
      const retryable = isNetworkApiError(error) || (isApiClientError(error) && error.status >= 500)
      const message = error instanceof Error ? error.message : 'Resolve and save failed.'
      setSaveStatus({
        kind: 'error',
        message,
        retryable,
      })
    }
  }

  const submit = () => {
    // Gate before allocating a mutation ID so double-clicks cannot orphan the in-flight id.
    if (!canSubmit || !activeResolution || !session || savingGateRef.current) {
      return
    }
    const content = buildResolvedSoapContent(activeResolution)
    if (!content) {
      return
    }
    const pending: PendingSave = {
      mutationId: generatorRef.current.next(),
      content,
      baseVersionId: session.serverHeadVersionId,
      noteId: session.noteId,
    }
    pendingSaveRef.current = pending
    void runSave(pending)
  }

  const retrySave = () => {
    if (saveStatus.kind !== 'error' || !saveStatus.retryable || savingGateRef.current) {
      return
    }
    const pending = pendingSaveRef.current
    if (!pending) {
      return
    }
    void runSave(pending)
  }

  const wrapDispatch = (action: ConflictResolutionAction) => {
    if (saveStatus.kind === 'error') {
      pendingSaveRef.current = null
      setSaveStatus({ kind: 'idle' })
    }
    boundDispatch(action)
  }

  return {
    hydration,
    resolution: activeResolution,
    dispatch: wrapDispatch,
    unresolvedCount,
    canSubmit,
    saveStatus,
    submit,
    retrySave,
    session,
  }
}
