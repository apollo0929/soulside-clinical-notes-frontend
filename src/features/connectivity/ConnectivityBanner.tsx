import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import { type ConnectivityService, getConnectivityService } from '@/services/offline/connectivity'
import type { ConnectivityState } from '@/services/offline/offline.types'
import { getActiveReplayCoordinator } from '@/services/offline/offline-bootstrap'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'
import {
  getActiveRealtimeCoordinator,
  subscribeRealtimeCoordinatorReady,
} from '@/services/realtime/realtime-bootstrap'
import type { RealtimeConnectionState } from '@/services/realtime/realtime-events'

function offlineBannerMessage(
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

function realtimeBannerMessage(state: RealtimeConnectionState): string | null {
  switch (state) {
    case 'CONNECTED':
      return 'Live updates connected'
    case 'CONNECTING':
      return 'Connecting live updates…'
    case 'RECONNECTING':
      return 'Reconnecting live updates…'
    case 'RESYNCING':
      return 'Resynchronizing…'
    case 'DEGRADED':
      return 'Live updates unavailable; data may be stale'
    case 'UNAVAILABLE':
      return 'Live updates unavailable.'
    case 'DISCONNECTED':
      return null
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
  realtimeState: RealtimeConnectionState | null,
): boolean {
  if (syncedFlash) {
    return true
  }
  if (summary.conflicts > 0 || summary.failed > 0 || summary.queued > 0) {
    return true
  }
  if (state.kind !== 'ONLINE') {
    return true
  }
  if (
    realtimeState === 'RECONNECTING' ||
    realtimeState === 'RESYNCING' ||
    realtimeState === 'DEGRADED' ||
    realtimeState === 'UNAVAILABLE' ||
    realtimeState === 'CONNECTING'
  ) {
    return true
  }
  return false
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

  const realtimeState = useSyncExternalStore(
    (listener) => {
      let unsubCoordinator: (() => void) | null = null
      const bind = () => {
        unsubCoordinator?.()
        unsubCoordinator = null
        const coordinator = getActiveRealtimeCoordinator()
        if (coordinator) {
          unsubCoordinator = coordinator.subscribeConnectionState(() => listener())
        }
        listener()
      }
      bind()
      const unsubReady = subscribeRealtimeCoordinatorReady(bind)
      return () => {
        unsubReady()
        unsubCoordinator?.()
      }
    },
    () => getActiveRealtimeCoordinator()?.getConnectionState() ?? null,
    () => null,
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

  const offlineMessage =
    syncedFlash && state.kind === 'ONLINE'
      ? 'All queued changes synchronized.'
      : offlineBannerMessage(state, summary)

  const liveMessage =
    state.kind === 'ONLINE' &&
    summary.queued === 0 &&
    summary.failed === 0 &&
    summary.conflicts === 0
      ? realtimeState
        ? realtimeBannerMessage(realtimeState)
        : null
      : null

  const message =
    liveMessage && (state.kind === 'ONLINE' || syncedFlash)
      ? summary.queued > 0 || summary.failed > 0 || summary.conflicts > 0 || state.kind !== 'ONLINE'
        ? offlineMessage
        : liveMessage
      : offlineMessage

  const realtimeText = realtimeState ? realtimeBannerMessage(realtimeState) : null
  // Avoid a second polite live region when the primary status already announces the same text.
  const announceRealtime =
    realtimeText && realtimeText !== message
      ? realtimeState === 'RECONNECTING' ||
        realtimeState === 'RESYNCING' ||
        realtimeState === 'DEGRADED' ||
        realtimeState === 'UNAVAILABLE' ||
        realtimeState === 'CONNECTED'
        ? realtimeText
        : null
      : null

  const visible = shouldShowBanner(state, summary, syncedFlash, realtimeState)

  // Keep a stable DOM node so CONNECTING/RECONNECTING/UNAVAILABLE updates do not remount.
  return (
    <section
      className={visible ? 'connectivity-banner' : 'connectivity-banner connectivity-banner--idle'}
      aria-labelledby={headingId}
      data-testid="connectivity-banner"
      data-visible={visible ? 'true' : 'false'}
      hidden={!visible}
    >
      <h2 id={headingId} className="visually-hidden">
        Connectivity status
      </h2>
      <p className="connectivity-banner__message" role="status" aria-live="polite">
        {message}
      </p>
      {announceRealtime ? (
        <p className="visually-hidden" role="status" aria-live="polite">
          {announceRealtime}
        </p>
      ) : null}
      {realtimeText ? (
        <p className="connectivity-banner__realtime" data-testid="realtime-status">
          {realtimeText}
        </p>
      ) : null}
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
