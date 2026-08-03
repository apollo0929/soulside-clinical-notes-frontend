import './NoteDetailPage.css'

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { type NoteId, parseNoteId, parseUserId, type VersionId } from '@/domain/ids'
import type { NoteVersionRef } from '@/domain/models/note-version'
import type { ReviewEvent } from '@/domain/models/review-event'
import { cloneSoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'
import {
  AutosaveStatusBanner,
  autosaveStatusLabel,
  useNoteAutosave,
} from '@/features/note-detail/autosave'
import {
  conflictFromAutosaveStatus,
  useOfflineQueueRestore,
} from '@/features/note-detail/autosave/use-offline-queue-restore'
import {
  type ConflictLocalSnapshot,
  ConflictResolver,
  useConflictResolution,
} from '@/features/note-detail/conflict'
import {
  evaluateEditorAccess,
  resolveClinicianOwnerId,
  SoapEditor,
  useSoapEditor,
} from '@/features/note-detail/editor'
import {
  buildLifecycleActionDescriptors,
  getUiOccurredAt,
  sortReviewEventsNewestFirst,
  sortVersionsNewestFirst,
} from '@/features/note-detail/lifecycle-action-presentation'
import { LifecycleActionSummary } from '@/features/note-detail/LifecycleActionSummary'
import { resolveNotesBackHref } from '@/features/note-detail/note-detail.types'
import { NoteDetailErrorState } from '@/features/note-detail/NoteDetailErrorState'
import { NoteDetailSkeleton } from '@/features/note-detail/NoteDetailSkeleton'
import { NoteHeader } from '@/features/note-detail/NoteHeader'
import { ReviewTimeline } from '@/features/note-detail/ReviewTimeline'
import { SoapDiff } from '@/features/note-detail/SoapDiff'
import { SoapSectionsReadOnly } from '@/features/note-detail/SoapSectionsReadOnly'
import { useNoteDetail } from '@/features/note-detail/use-note-detail'
import { useNoteVersion } from '@/features/note-detail/use-note-version'
import {
  canCompareVersions,
  INITIAL_VERSION_COMPARISON,
  versionComparisonReducer,
} from '@/features/note-detail/version-comparison-reducer'
import { VersionHistory } from '@/features/note-detail/VersionHistory'
import { NotePresence } from '@/features/presence/NotePresence'
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'
import { useActorIdentity } from '@/services/api/use-actor-identity'
import { getConnectivityService } from '@/services/offline/connectivity'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'
import { subscribeReplaySuccess } from '@/services/offline/replay-success-bus'
import {
  bucketDurationMs,
  createConflictDetectedEvent,
  createConflictResolvedEvent,
  createEditorDiscardedEvent,
  createEditorOpenedEvent,
  createNoteDetailOpenedEvent,
  trackTelemetry,
} from '@/services/telemetry'

function tryParseNoteId(raw: string | undefined): NoteId | null {
  if (!raw) {
    return null
  }
  try {
    return parseNoteId(raw)
  } catch {
    return null
  }
}

function findVersionLabel(
  versions: readonly { readonly id: VersionId; readonly revisionNumber: number }[],
  versionId: VersionId | null,
): string {
  if (!versionId) {
    return 'Unknown'
  }
  const match = versions.find((version) => version.id === versionId)
  return match ? `revision ${match.revisionNumber}` : String(versionId)
}

export function NoteDetailPage() {
  const params = useParams()
  const location = useLocation()
  const noteId = tryParseNoteId(params.noteId)
  const backHref = resolveNotesBackHref(location.state)
  const editButtonRef = useRef<HTMLButtonElement>(null)

  const detailQuery = useNoteDetail(noteId)
  const [comparison, dispatchComparison] = useReducer(
    versionComparisonReducer,
    INITIAL_VERSION_COMPARISON,
  )

  const aggregate = detailQuery.data ?? null
  const detailOpenedTracked = useRef(false)
  useEffect(() => {
    if (!aggregate || detailOpenedTracked.current) {
      return
    }
    detailOpenedTracked.current = true
    trackTelemetry((ctx) => createNoteDetailOpenedEvent(ctx, { noteStatus: aggregate.note.status }))
  }, [aggregate])

  const sortedVersions = useMemo((): readonly NoteVersionRef[] => {
    if (!aggregate) {
      return []
    }
    return sortVersionsNewestFirst(aggregate.versions)
  }, [aggregate])
  const timeline = useMemo((): readonly ReviewEvent[] => {
    if (!aggregate) {
      return []
    }
    return sortReviewEventsNewestFirst(aggregate.reviewEvents)
  }, [aggregate])

  useEffect(() => {
    dispatchComparison({ type: 'CLEAR' })
  }, [noteId])

  useEffect(() => {
    if (!aggregate) {
      return
    }
    dispatchComparison({
      type: 'RESET',
      currentVersionId: aggregate.currentVersion.id,
      parentVersionId: aggregate.currentVersion.parentVersionId,
    })
  }, [aggregate])

  const currentVersionId = aggregate?.currentVersion.id ?? null
  const compareEnabled = sortedVersions.length > 1
  const versionIdsForNote = useMemo(() => {
    if (!aggregate) {
      return null
    }
    return new Set(aggregate.versions.map((version) => version.id))
  }, [aggregate])

  const baseNeedsFetch =
    Boolean(aggregate) &&
    Boolean(comparison.baseVersionId) &&
    comparison.baseVersionId !== currentVersionId &&
    Boolean(comparison.baseVersionId && versionIdsForNote?.has(comparison.baseVersionId))
  const compareNeedsFetch =
    Boolean(aggregate) &&
    Boolean(comparison.compareVersionId) &&
    comparison.compareVersionId !== currentVersionId &&
    Boolean(comparison.compareVersionId && versionIdsForNote?.has(comparison.compareVersionId))

  const baseVersionQuery = useNoteVersion(noteId, comparison.baseVersionId, {
    enabled: baseNeedsFetch,
  })
  const compareVersionQuery = useNoteVersion(noteId, comparison.compareVersionId, {
    enabled: compareNeedsFetch,
  })

  const clinicianId = useMemo(() => {
    if (!aggregate) {
      return null
    }
    return resolveClinicianOwnerId(aggregate.versions, aggregate.currentVersion.authorId)
  }, [aggregate])

  const actorIdentity = useActorIdentity()
  const actor = useMemo(
    () => ({
      userId: parseUserId(actorIdentity.userId),
      role: actorIdentity.role,
    }),
    [actorIdentity.userId, actorIdentity.role],
  )

  const editorAccess = useMemo(() => {
    if (!aggregate || !clinicianId) {
      return {
        editable: false as const,
        reasonCode: 'RESOURCE_CONTEXT_REQUIRED',
        reason: 'Note context is required before editing.',
      }
    }
    return evaluateEditorAccess({
      actor,
      noteId: aggregate.note.id,
      status: aggregate.note.status,
      clinicianId,
      assignedReviewerId: aggregate.note.assignedReviewerId,
    })
  }, [aggregate, actor, clinicianId])

  const soapEditor = useSoapEditor({
    noteId,
    currentVersionId: aggregate?.currentVersion.id ?? null,
    currentContent: aggregate?.currentVersion.content ?? null,
    enabled: editorAccess.editable && noteId !== null && Boolean(aggregate),
  })

  const autosave = useNoteAutosave({
    enabled: editorAccess.editable && soapEditor.isEditing,
    noteId,
    editorState: soapEditor.state,
    dispatch: soapEditor.dispatch,
  })

  useEffect(() => {
    if (!noteId) {
      return
    }
    return subscribeReplaySuccess((event) => {
      if (event.noteId !== noteId) {
        return
      }
      soapEditor.dispatch({
        type: 'ACCEPT_SAVED_VERSION',
        baseVersionId: event.versionId,
        content: event.content,
      })
      autosave.applyReplaySuccess({
        versionId: event.versionId,
        content: event.content,
        mutationId: event.mutationId,
      })
    })
  }, [autosave, noteId, soapEditor])

  useOfflineQueueRestore({
    noteId,
    enabled: editorAccess.editable && Boolean(aggregate),
    serverContent: aggregate?.currentVersion.content ?? null,
    soapEditor,
    autosave,
  })

  type ConflictHold = {
    readonly dto: VersionConflictResponseDto
    readonly snapshot: ConflictLocalSnapshot
  }
  const [conflictHold, setConflictHold] = useState<ConflictHold | null>(null)
  const conflictDto = conflictFromAutosaveStatus(autosave.status)
  const inConflict = conflictDto !== null
  const conflictDetectedTracked = useRef(false)
  const conflictStartedAtRef = useRef<number | null>(null)

  // Capture local draft once when CONFLICT begins; clear when autosave leaves CONFLICT.
  if (inConflict && soapEditor.state && conflictHold === null && conflictDto) {
    setConflictHold({
      dto: conflictDto,
      snapshot: {
        noteId: soapEditor.state.noteId,
        localBaseVersionId:
          autosave.status.kind === 'BLOCKED_CONFLICT'
            ? // Prefer queued base when restoring from offline conflict.
              soapEditor.state.baseVersionId
            : soapEditor.state.baseVersionId,
        localContent: cloneSoapContent(soapEditor.state.draftContent),
      },
    })
  } else if (!inConflict && conflictHold !== null) {
    setConflictHold(null)
  }

  useEffect(() => {
    if (!inConflict) {
      conflictDetectedTracked.current = false
      return
    }
    if (conflictDetectedTracked.current) {
      return
    }
    conflictDetectedTracked.current = true
    conflictStartedAtRef.current = performance.now()
    trackTelemetry((ctx) =>
      createConflictDetectedEvent(ctx, {
        conflictingSectionCount: 4,
      }),
    )
  }, [inConflict])

  const conflictResolution = useConflictResolution({
    active: inConflict && conflictHold !== null,
    snapshot: conflictHold?.snapshot ?? null,
    conflict: conflictHold?.dto ?? null,
    onResolved: (result) => {
      const durationMs =
        conflictStartedAtRef.current !== null ? performance.now() - conflictStartedAtRef.current : 0
      conflictStartedAtRef.current = null
      trackTelemetry((ctx) =>
        createConflictResolvedEvent(ctx, {
          conflictingSectionCount: 4,
          durationBucket: bucketDurationMs(durationMs),
        }),
      )
      soapEditor.dispatch({
        type: 'ACCEPT_SAVED_VERSION',
        baseVersionId: result.versionId,
        content: result.content,
      })
      autosave.clearConflictResolved({
        versionId: result.versionId,
        content: result.content,
      })
      // Remove blocked offline queue entry after successful Step 9 resolution,
      // and advance any predecessor-linked follow-ups to the resolved head.
      if (noteId) {
        void createQueuedWriteRepository()
          .listByNote(noteId)
          .then(async (rows) => {
            const repo = createQueuedWriteRepository()
            for (const row of rows) {
              if (row.status === 'BLOCKED_CONFLICT') {
                await repo.advanceFollowUpBase(row.id, result.versionId)
                await repo.remove(row.id)
              }
            }
          })
      }
      setConflictHold(null)
      queueMicrotask(() => {
        const heading = document.querySelector('.soap-editor h2')
        if (heading instanceof HTMLElement) {
          heading.focus()
          return
        }
        document.getElementById('soap-editor-save-label')?.focus?.()
      })
    },
    onRepeatedConflict: (nextConflict, localContent, attemptedBaseVersionId) => {
      autosave.replaceConflict(nextConflict)
      setConflictHold({
        dto: nextConflict,
        snapshot: {
          noteId: noteId!,
          localBaseVersionId: attemptedBaseVersionId,
          localContent,
        },
      })
    },
  })

  const connectivity = getConnectivityService()
  const connectivityState = useSyncExternalStore(
    (listener) => connectivity.subscribe(() => listener()),
    () => connectivity.getSnapshot(),
    () => connectivity.getSnapshot(),
  )
  const offlineStale =
    Boolean(aggregate) &&
    (connectivityState.kind === 'OFFLINE' || connectivityState.kind === 'DEGRADED')
  const actionDescriptors = useMemo(() => {
    if (!aggregate || !clinicianId) {
      return []
    }
    return buildLifecycleActionDescriptors({
      aggregate,
      clinicianId,
      occurredAt: getUiOccurredAt(),
      actorUserId: actorIdentity.userId,
      actorRole: actorIdentity.role,
    })
  }, [aggregate, clinicianId, actorIdentity.userId, actorIdentity.role])

  if (noteId === null) {
    return (
      <main className="note-detail-page" aria-labelledby="note-detail-heading">
        <NoteDetailErrorState
          kind="invalid-route"
          message="The note link is not a valid note identifier."
          backHref={backHref}
        />
      </main>
    )
  }

  if (detailQuery.isPending) {
    return (
      <main className="note-detail-page" aria-labelledby="note-detail-heading">
        <NoteDetailSkeleton />
      </main>
    )
  }

  if (detailQuery.isError && !aggregate) {
    const error = detailQuery.error
    const offlineUnavailable =
      connectivityState.kind === 'OFFLINE' ||
      isNetworkApiError(error) ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    if (offlineUnavailable) {
      return (
        <main className="note-detail-page" aria-labelledby="note-detail-heading">
          <NoteDetailErrorState
            kind="generic"
            message="This note is unavailable offline. Connect to the network to load it."
            backHref={backHref}
          />
        </main>
      )
    }
    if (isApiClientError(error) && error.status === 403) {
      return (
        <main className="note-detail-page" aria-labelledby="note-detail-heading">
          <NoteDetailErrorState
            kind="forbidden"
            message={error.message || 'You do not have permission to view this note.'}
            backHref={backHref}
          />
        </main>
      )
    }
    if (isApiClientError(error) && error.status === 404) {
      return (
        <main className="note-detail-page" aria-labelledby="note-detail-heading">
          <NoteDetailErrorState
            kind="not-found"
            message={error.message || 'This note could not be found.'}
            backHref={backHref}
          />
        </main>
      )
    }
    const message = isApiClientError(error)
      ? error.message
      : 'An unexpected error occurred while loading this note.'
    return (
      <main className="note-detail-page" aria-labelledby="note-detail-heading">
        <NoteDetailErrorState
          kind="generic"
          message={message}
          backHref={backHref}
          onRetry={() => {
            void detailQuery.refetch()
          }}
        />
      </main>
    )
  }

  if (!aggregate) {
    return (
      <main className="note-detail-page" aria-labelledby="note-detail-heading">
        <NoteDetailErrorState
          kind="generic"
          message="Note detail was empty after a successful load."
          backHref={backHref}
          onRetry={() => {
            void detailQuery.refetch()
          }}
        />
      </main>
    )
  }

  const showDiff = canCompareVersions(comparison) && compareEnabled && !soapEditor.isEditing
  const baseContent =
    comparison.baseVersionId === currentVersionId
      ? aggregate.currentVersion.content
      : baseVersionQuery.data?.content
  const compareContent =
    comparison.compareVersionId === currentVersionId
      ? aggregate.currentVersion.content
      : compareVersionQuery.data?.content

  const diffLoading =
    showDiff &&
    ((baseNeedsFetch && baseVersionQuery.isPending) ||
      (compareNeedsFetch && compareVersionQuery.isPending))
  const diffError =
    showDiff &&
    ((baseNeedsFetch && baseVersionQuery.isError) ||
      (compareNeedsFetch && compareVersionQuery.isError))

  const accessReasonId = 'soap-edit-access-reason'

  return (
    <main className="note-detail-page" aria-labelledby="note-detail-heading">
      <NoteHeader aggregate={aggregate} backHref={backHref} />
      {noteId ? (
        <NotePresence noteId={noteId} activity={soapEditor.isEditing ? 'EDITING' : 'VIEWING'} />
      ) : null}
      {offlineStale ? (
        <p
          className="offline-stale-indicator"
          role="status"
          aria-live="polite"
          data-testid="offline-stale-indicator"
        >
          Showing cached note — not refreshed from the server.
        </p>
      ) : null}

      <div className="note-detail-page__layout">
        <div className="note-detail-page__main">
          <div className="note-detail-page__soap-controls">
            {editorAccess.editable ? (
              soapEditor.isEditing ? null : (
                <button
                  ref={editButtonRef}
                  type="button"
                  className="note-detail-page__edit-note"
                  onClick={() => {
                    soapEditor.beginEdit()
                    if (aggregate) {
                      trackTelemetry((ctx) =>
                        createEditorOpenedEvent(ctx, { noteStatus: aggregate.note.status }),
                      )
                    }
                  }}
                >
                  Edit note
                </button>
              )
            ) : (
              <p id={accessReasonId} className="note-detail-page__edit-reason" role="status">
                Editing unavailable: {editorAccess.reason}
              </p>
            )}
          </div>

          {soapEditor.isEditing && soapEditor.state ? (
            <SoapEditor
              state={soapEditor.state}
              saveLabel={autosaveStatusLabel(autosave.status)}
              baseRevision={
                sortedVersions.find((version) => version.id === soapEditor.state!.baseVersionId)
                  ?.revisionNumber ?? aggregate.currentVersion.revisionNumber
              }
              newerVersionWarning={soapEditor.newerVersionWarning}
              guardActive={autosave.guardActive}
              locallyDurable={autosave.locallyDurable}
              frozen={inConflict}
              autosaveSlot={
                <AutosaveStatusBanner status={autosave.status} onRetry={autosave.retry} />
              }
              conflictSlot={
                inConflict ? (
                  <ConflictResolver
                    conflictResolution={conflictResolution}
                    onContinueReviewing={() => {
                      document
                        .querySelector('.conflict-resolver__heading')
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}
                  />
                ) : null
              }
              editButtonRef={editButtonRef}
              onUpdateSection={(section, value) => {
                soapEditor.dispatch({ type: 'UPDATE_SECTION', section, value })
              }}
              onResetSection={(section) => {
                soapEditor.dispatch({ type: 'RESET_SECTION', section })
              }}
              onDiscardAndExit={() => {
                const dirtyCount = soapEditor.state?.dirtySections.size ?? 0
                trackTelemetry((ctx) =>
                  createEditorDiscardedEvent(ctx, { dirtySectionCount: dirtyCount }),
                )
                if (noteId) {
                  void createQueuedWriteRepository().removeUnsentForNote(noteId)
                }
                soapEditor.discardAndExit()
              }}
              onCancelClean={() => {
                soapEditor.exitEdit()
              }}
            />
          ) : showDiff ? (
            <div className="note-detail-page__diff">
              {diffLoading ? (
                <p role="status" aria-live="polite">
                  Loading selected versions for comparison…
                </p>
              ) : null}
              {diffError ? (
                <div className="note-detail-page__diff-error" role="alert">
                  <p>Could not load one of the selected versions for comparison.</p>
                  <p>Current note content remains available below.</p>
                  <SoapSectionsReadOnly content={aggregate.currentVersion.content} />
                </div>
              ) : null}
              {!diffLoading && !diffError && baseContent && compareContent ? (
                <SoapDiff
                  baseContent={baseContent}
                  compareContent={compareContent}
                  baseLabel={findVersionLabel(sortedVersions, comparison.baseVersionId)}
                  compareLabel={findVersionLabel(sortedVersions, comparison.compareVersionId)}
                />
              ) : null}
              {!diffLoading && !diffError && (!baseContent || !compareContent) ? (
                <SoapSectionsReadOnly content={aggregate.currentVersion.content} />
              ) : null}
            </div>
          ) : (
            <SoapSectionsReadOnly content={aggregate.currentVersion.content} />
          )}

          {!soapEditor.isEditing &&
          !showDiff &&
          comparison.baseVersionId === comparison.compareVersionId ? (
            <p role="status">Select two different versions to compare changes.</p>
          ) : null}

          <LifecycleActionSummary
            descriptors={actionDescriptors}
            isLocked={aggregate.note.status === 'LOCKED'}
          />

          <ReviewTimeline events={timeline} />
        </div>

        <aside className="note-detail-page__sidebar">
          <VersionHistory
            versions={sortedVersions}
            currentVersionId={aggregate.currentVersion.id}
            baseVersionId={comparison.baseVersionId}
            compareVersionId={comparison.compareVersionId}
            compareDisabled={!compareEnabled}
            onSelectBase={(versionId) => {
              if (soapEditor.isEditing) {
                return
              }
              dispatchComparison({ type: 'SET_BASE', versionId })
            }}
            onSelectCompare={(versionId) => {
              if (soapEditor.isEditing) {
                return
              }
              dispatchComparison({ type: 'SET_COMPARE', versionId })
            }}
          />
          {soapEditor.isEditing ? (
            <p className="note-detail-page__editor-base-hint" role="status">
              Editor uses the current version only. Historical versions stay read-only.
            </p>
          ) : null}
        </aside>
      </div>

      <p className="note-detail-page__footer-back">
        <Link to={backHref}>Back to notes</Link>
      </p>
    </main>
  )
}
