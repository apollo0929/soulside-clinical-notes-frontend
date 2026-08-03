import { describe, expect, it, vi } from 'vitest'

import { ConnectivityService } from '@/services/offline/connectivity'
import {
  clearPersistedLastEventId,
  createRealtimeCoordinator,
} from '@/services/realtime/realtime-coordinator'
import {
  classifyRealtimeHttpFailure,
  classifyRealtimeHttpStatus,
} from '@/services/realtime/realtime-failure'
import type { RealtimeTransportConnectOptions } from '@/services/realtime/realtime-transport'

describe('realtime failure classification', () => {
  it('marks 404 and 403 as non-retryable', () => {
    expect(classifyRealtimeHttpStatus(404)).toBe('non_retryable')
    expect(classifyRealtimeHttpStatus(403)).toBe('non_retryable')
    expect(classifyRealtimeHttpStatus(401)).toBe('non_retryable')
    expect(classifyRealtimeHttpStatus(400)).toBe('non_retryable')
  })

  it('marks 500 and network-class statuses as retryable', () => {
    expect(classifyRealtimeHttpStatus(500)).toBe('retryable')
    expect(classifyRealtimeHttpStatus(503)).toBe('retryable')
    expect(classifyRealtimeHttpStatus(408)).toBe('retryable')
    expect(classifyRealtimeHttpStatus(429)).toBe('retryable')
  })
})

describe('RealtimeCoordinator non-retryable failures', () => {
  it('404/UNAVAILABLE clears reconnect timer and does not issue a second connect', async () => {
    clearPersistedLastEventId()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    let connectCount = 0
    const scheduled: Array<() => void> = []
    const transport = {
      connect(options: RealtimeTransportConnectOptions) {
        connectCount += 1
        options.onFailure?.(classifyRealtimeHttpFailure(404))
        options.onStateChange('UNAVAILABLE')
      },
    }

    const coordinator = createRealtimeCoordinator({
      transport,
      connectivity,
      scheduler: {
        schedule(_delay, work) {
          scheduled.push(work)
          return () => undefined
        },
      },
      handlers: {
        onReconcile: () => undefined,
        onPresence: () => undefined,
        onResync: () => undefined,
      },
    })

    coordinator.start()
    // Drain the initial connect schedule.
    scheduled.shift()?.()
    expect(connectCount).toBe(1)
    expect(coordinator.getConnectionState()).toBe('UNAVAILABLE')
    expect(coordinator.hasPendingReconnectTimer()).toBe(false)

    // Online transitions must not reconnect after terminal failure.
    connectivity.markOnline()
    for (const work of scheduled.splice(0, scheduled.length)) {
      work()
    }
    expect(connectCount).toBe(1)

    coordinator.dispose()
    connectivity.stop()
  })

  it('500/RECONNECTING schedules reconnect', async () => {
    clearPersistedLastEventId()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const delays: number[] = []
    let connectCount = 0
    const transport = {
      connect(options: RealtimeTransportConnectOptions) {
        connectCount += 1
        if (connectCount === 1) {
          options.onStateChange('RECONNECTING')
        } else {
          options.onStateChange('CONNECTED')
        }
      },
    }

    const coordinator = createRealtimeCoordinator({
      transport,
      connectivity,
      scheduler: {
        schedule(delay, work) {
          delays.push(delay)
          // Run immediately for determinism.
          work()
          return () => undefined
        },
      },
      handlers: {
        onReconcile: () => undefined,
        onPresence: () => undefined,
        onResync: () => undefined,
      },
    })

    coordinator.start()
    await vi.waitFor(() => {
      expect(connectCount).toBeGreaterThanOrEqual(2)
    })
    expect(delays.some((delay) => delay > 0)).toBe(true)
    expect(coordinator.getConnectionState()).toBe('CONNECTED')
    coordinator.dispose()
    connectivity.stop()
  })

  it('network-style RECONNECTING schedules reconnect without going UNAVAILABLE', () => {
    clearPersistedLastEventId()
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    let connectCount = 0
    const scheduled: Array<() => void> = []
    const transport = {
      connect(options: RealtimeTransportConnectOptions) {
        connectCount += 1
        options.onStateChange('RECONNECTING')
      },
    }

    const coordinator = createRealtimeCoordinator({
      transport,
      connectivity,
      scheduler: {
        schedule(_delay, work) {
          scheduled.push(work)
          return () => undefined
        },
      },
      handlers: {
        onReconcile: () => undefined,
        onPresence: () => undefined,
        onResync: () => undefined,
      },
    })

    coordinator.start()
    scheduled.shift()?.()
    expect(connectCount).toBe(1)
    expect(coordinator.getConnectionState()).toBe('RECONNECTING')
    expect(coordinator.hasPendingReconnectTimer()).toBe(true)
    expect(coordinator.getConnectionState()).not.toBe('UNAVAILABLE')
    coordinator.dispose()
    connectivity.stop()
  })
})
