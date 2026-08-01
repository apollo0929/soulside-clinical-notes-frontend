import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import { type ConnectivityService, getConnectivityService } from '@/services/offline/connectivity'
import type { ConnectivityState } from '@/services/offline/offline.types'
import { getActiveReplayCoordinator } from '@/services/offline/offline-bootstrap'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'

function bannerMessage(
  state: ConnectivityState,
  summary: { queued: number; conflicts: number; failed: number },
): string {
  if (summary.conflicts > 0) {
    return `${summary.conflicts} change${summary.conflicts === 1 ? '' : 's'} require conflict resolution.`
  }
  if (summary.failed > 0) {
    return 'Some changes could not be synchronized.'
  }
  switch (state.kind) {
    case 'OFFLINE':
      return 'Offline — changes will be saved on this device.'
    case 'RECONNECTING':
      return 'Reconnecting…'
    case 'REPLAYING':
      return `Replaying ${state.remaining} queued change${state.remaining === 1 ? '' : 's'}…`
    case 'DEGRADED':
      return state.reason
    case 'ONLINE':
      if (summary.queued > 0) {
        return `${summary.queued} queued change${summary.queued === 1 ? '' : 's'} waiting to sync.`
      }
      return 'All queued changes synchronized.'
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

function shouldShowBanner(
  state: ConnectivityState,
  summary: { queued: number; conflicts: number; failed: number },
  syncedFlash: boolean,
): boolean {
  if (syncedFlash) {
    return true
  }
  if (summary.conflicts > 0 || summary.failed > 0 || summary.queued > 0) {
    return true
  }
  return state.kind !== 'ONLINE'
}

export type ConnectivityBannerProps = {
  readonly connectivity?: ConnectivityService
}

export function ConnectivityBanner({ connectivity }: ConnectivityBannerProps) {
  const service = connectivity ?? getConnectivityService()
  const headingId = useId()
  const [syncedFlash, setSyncedFlash] = useState(false)
  const previousKind = useRef(service.getSnapshot().kind)

  const state = useSyncExternalStore(
    (listener) => service.subscribe(() => listener()),
    () => service.getSnapshot(),
    () => service.getSnapshot(),
  )

  const summary = useSyncExternalStore(
    (listener) => service.subscribe(() => listener()),
    () => service.getQueueSummary(),
    () => service.getQueueSummary(),
  )

  useEffect(() => {
    if (
      previousKind.current === 'REPLAYING' &&
      state.kind === 'ONLINE' &&
      summary.queued === 0 &&
      summary.failed === 0 &&
      summary.conflicts === 0
    ) {
      setSyncedFlash(true)
    }
    previousKind.current = state.kind
  }, [state.kind, summary.queued, summary.failed, summary.conflicts])

  useEffect(() => {
    if (!syncedFlash) {
      return
    }
    const timer = globalThis.setTimeout(() => setSyncedFlash(false), 4000)
    return () => globalThis.clearTimeout(timer)
  }, [syncedFlash])

  if (!shouldShowBanner(state, summary, syncedFlash)) {
    return null
  }

  const message =
    syncedFlash && state.kind === 'ONLINE'
      ? 'All queued changes synchronized.'
      : bannerMessage(state, summary)

  return (
    <section
      className="connectivity-banner"
      aria-labelledby={headingId}
      data-testid="connectivity-banner"
    >
      <h2 id={headingId} className="visually-hidden">
        Connectivity status
      </h2>
      <p className="connectivity-banner__message" role="status" aria-live="polite">
        {message}
      </p>
      {summary.queued > 0 ? (
        <p className="connectivity-banner__count" data-testid="connectivity-queue-count">
          Queue: {summary.queued}
        </p>
      ) : null}
      {summary.failed > 0 ? (
        <button
          type="button"
          className="connectivity-banner__retry"
          aria-label="Retry failed synchronization"
          onClick={() => {
            void (async () => {
              const repo = createQueuedWriteRepository()
              const rows = await repo.listAll()
              for (const row of rows) {
                if (row.status === 'FAILED') {
                  await repo.markQueuedForRetry(row.id, {
                    errorCode: row.lastErrorCode ?? 'RETRY',
                    retryCount: 0,
                  })
                }
              }
              void getActiveReplayCoordinator()?.replayNow()
            })()
          }}
        >
          Retry failed sync
        </button>
      ) : null}
    </section>
  )
}
