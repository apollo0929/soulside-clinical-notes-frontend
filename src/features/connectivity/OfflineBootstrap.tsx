import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { parseUserId } from '@/domain/ids'
import { reconcileDetailCacheAfterSave } from '@/features/note-detail/autosave/note-detail-cache'
import { getActorIdentity } from '@/services/api/actor-provider'
import { ensureOfflineBootstrap } from '@/services/offline/offline-bootstrap'
import { notifyReplaySuccess } from '@/services/offline/replay-success-bus'

/**
 * Boots IndexedDB, hydrates query cache, and starts replay.
 * Idempotent under Strict Mode.
 */
export function OfflineBootstrap() {
  const queryClient = useQueryClient()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    void ensureOfflineBootstrap(queryClient, {
      onConflict: () => {
        // Entry already marked BLOCKED_CONFLICT with payload in IndexedDB.
      },
      onReplaySuccess: ({ entry, result }) => {
        const actor = getActorIdentity()
        reconcileDetailCacheAfterSave(queryClient, {
          noteId: entry.noteId,
          versionId: result.versionId,
          revision: result.revision,
          parentVersionId: result.parentVersionId,
          savedContent: result.savedContent,
          authorId: parseUserId(actor.userId),
          authorRole: actor.role,
        })
        notifyReplaySuccess({
          noteId: entry.noteId,
          versionId: result.versionId,
          content: result.savedContent,
          mutationId: entry.clientMutationId,
        })
        void import('@/services/telemetry').then(
          ({ bucketDurationMs, createOfflineReplaySucceededEvent, trackTelemetry }) => {
            trackTelemetry((ctx) =>
              createOfflineReplaySucceededEvent(ctx, {
                retryCount: entry.retryCount,
                durationBucket: bucketDurationMs(0),
              }),
            )
          },
        )
      },
      onReplayFailed: ({ entry, error }) => {
        void import('@/services/telemetry').then(
          ({ classifyTelemetryError, createOfflineReplayFailedEvent, trackTelemetry }) => {
            trackTelemetry((ctx) =>
              createOfflineReplayFailedEvent(ctx, {
                errorCode: classifyTelemetryError(error),
                retryCount: entry.retryCount,
              }),
            )
          },
        )
      },
    })
  }, [queryClient])

  return null
}
