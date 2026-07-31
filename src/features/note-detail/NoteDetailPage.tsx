import './NoteDetailPage.css'

import { useEffect, useMemo, useReducer } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { type NoteId, parseNoteId, type VersionId } from '@/domain/ids'
import type { NoteVersionRef } from '@/domain/models/note-version'
import type { ReviewEvent } from '@/domain/models/review-event'
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
import { isApiClientError, isNetworkApiError } from '@/services/api/api-errors'

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

  const detailQuery = useNoteDetail(noteId)
  const [comparison, dispatchComparison] = useReducer(
    versionComparisonReducer,
    INITIAL_VERSION_COMPARISON,
  )

  const aggregate = detailQuery.data ?? null
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
    const oldest = [...aggregate.versions].sort((a, b) => a.revisionNumber - b.revisionNumber)[0]
    return oldest?.authorId ?? aggregate.currentVersion.authorId
  }, [aggregate])

  const actionDescriptors = useMemo(() => {
    if (!aggregate || !clinicianId) {
      return []
    }
    return buildLifecycleActionDescriptors({
      aggregate,
      clinicianId,
      occurredAt: getUiOccurredAt(),
    })
  }, [aggregate, clinicianId])

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

  if (detailQuery.isError) {
    const error = detailQuery.error
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
    const message = isNetworkApiError(error)
      ? error.message
      : isApiClientError(error)
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

  const showDiff = canCompareVersions(comparison) && compareEnabled
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

  return (
    <main className="note-detail-page" aria-labelledby="note-detail-heading">
      <NoteHeader aggregate={aggregate} backHref={backHref} />

      <div className="note-detail-page__layout">
        <div className="note-detail-page__main">
          {showDiff ? (
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

          {!showDiff && comparison.baseVersionId === comparison.compareVersionId ? (
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
              dispatchComparison({ type: 'SET_BASE', versionId })
            }}
            onSelectCompare={(versionId) => {
              dispatchComparison({ type: 'SET_COMPARE', versionId })
            }}
          />
        </aside>
      </div>

      <p className="note-detail-page__footer-back">
        <Link to={backHref}>Back to notes</Link>
      </p>
    </main>
  )
}
