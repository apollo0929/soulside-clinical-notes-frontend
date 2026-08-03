import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseSessionId, parseUserId } from '@/domain/ids'
import { registerActiveMockRealtimeServer } from '@/mock/realtime/active-server'
import { RealtimeServer } from '@/mock/realtime/realtime-server'
import { createTestDatabase } from '@/mock/test/helpers'
import {
  getConnectivityService,
  resetConnectivityServiceForTests,
} from '@/services/offline/connectivity'
import {
  ensureRealtimeBootstrap,
  getActiveRealtimeCoordinator,
  getRealtimeCoordinatorReadyListenerCountForTests,
  resetRealtimeBootstrapForTests,
  resetRealtimeEnvironmentForTests,
  subscribeRealtimeCoordinatorReady,
} from '@/services/realtime/realtime-bootstrap'
import {
  clearPersistedLastEventId,
  createRealtimeCoordinator,
  LAST_EVENT_ID_STORAGE_KEY,
} from '@/services/realtime/realtime-coordinator'
import type { RealtimeTransportConnectOptions } from '@/services/realtime/realtime-transport'

describe('resetRealtimeEnvironmentForTests', () => {
  afterEach(() => {
    resetRealtimeEnvironmentForTests()
    clearPersistedLastEventId()
  })

  it('creates, disposes, and recreates the app-scoped coordinator', async () => {
    const queryClient = new QueryClient()
    const connectivity = getConnectivityService()
    connectivity.start()
    connectivity.markOnline()

    const first = await ensureRealtimeBootstrap(queryClient, {
      connectivity,
      transport: {
        connect(options: RealtimeTransportConnectOptions) {
          options.onStateChange('CONNECTED')
        },
        disconnect() {
          // no-op
        },
      },
      sessionId: parseSessionId('prs_reset_1'),
      scheduler: {
        schedule() {
          return () => undefined
        },
      },
    })
    expect(first.isDisposed()).toBe(false)
    expect(getActiveRealtimeCoordinator()).toBe(first)

    resetRealtimeEnvironmentForTests()
    expect(first.isDisposed()).toBe(true)
    expect(getActiveRealtimeCoordinator()).toBeNull()

    const second = await ensureRealtimeBootstrap(queryClient, {
      connectivity: getConnectivityService(),
      transport: {
        connect(options: RealtimeTransportConnectOptions) {
          options.onStateChange('CONNECTED')
        },
      },
      sessionId: parseSessionId('prs_reset_2'),
      scheduler: {
        schedule() {
          return () => undefined
        },
      },
    })
    expect(second.isDisposed()).toBe(false)
    expect(getActiveRealtimeCoordinator()).toBe(second)
    expect(second).not.toBe(first)
    second.dispose()
  })

  it('does not return a disposed coordinator from the ready subscription', async () => {
    const queryClient = new QueryClient()
    const seen: Array<ReturnType<typeof getActiveRealtimeCoordinator>> = []
    const unsub = subscribeRealtimeCoordinatorReady(() => {
      seen.push(getActiveRealtimeCoordinator())
    })

    const coordinator = await ensureRealtimeBootstrap(queryClient, {
      transport: {
        connect(options: RealtimeTransportConnectOptions) {
          options.onStateChange('CONNECTED')
        },
      },
      sessionId: parseSessionId('prs_ready_disposed'),
      scheduler: {
        schedule() {
          return () => undefined
        },
      },
    })
    await vi.waitFor(() => {
      expect(seen.some((value) => value === coordinator)).toBe(true)
    })

    resetRealtimeBootstrapForTests()
    expect(getActiveRealtimeCoordinator()).toBeNull()
    expect(seen.at(-1)).toBeNull()
    unsub()
  })

  it('does not grow ready-listener count across resets', () => {
    const unsubA = subscribeRealtimeCoordinatorReady(() => undefined)
    const unsubB = subscribeRealtimeCoordinatorReady(() => undefined)
    expect(getRealtimeCoordinatorReadyListenerCountForTests()).toBe(2)
    resetRealtimeEnvironmentForTests()
    expect(getRealtimeCoordinatorReadyListenerCountForTests()).toBe(0)
    unsubA()
    unsubB()
    const unsubC = subscribeRealtimeCoordinatorReady(() => undefined)
    expect(getRealtimeCoordinatorReadyListenerCountForTests()).toBe(1)
    resetRealtimeEnvironmentForTests()
    expect(getRealtimeCoordinatorReadyListenerCountForTests()).toBe(0)
    unsubC()
  })

  it('clears reconnect timers on reset', () => {
    let cancelCount = 0
    const connectivity = getConnectivityService()
    connectivity.start()
    connectivity.markOnline()

    const coordinator = createRealtimeCoordinator({
      connectivity,
      transport: {
        connect(options: RealtimeTransportConnectOptions) {
          options.onStateChange('RECONNECTING')
        },
      },
      scheduler: {
        schedule(_delay, _work) {
          return () => {
            cancelCount += 1
          }
        },
      },
      handlers: {
        onReconcile: () => undefined,
        onPresence: () => undefined,
        onResync: () => undefined,
      },
    })
    coordinator.start()
    expect(coordinator.hasPendingReconnectTimer()).toBe(true)
    coordinator.dispose()
    expect(coordinator.hasPendingReconnectTimer()).toBe(false)
    expect(cancelCount).toBeGreaterThan(0)
  })

  it('returns mock subscriber count to zero and empties presence on reset', () => {
    const database = createTestDatabase({ noteCount: 4, seed: 17 })
    const server = new RealtimeServer({
      database,
      now: () => parseIsoDateTime('2024-07-01T00:00:00.000Z'),
    })
    registerActiveMockRealtimeServer(server)

    const unsub = server.connect({
      actor: { userId: parseUserId('usr_admin_1'), role: 'ADMIN' },
      lastEventId: null,
      onEvent: () => undefined,
    })
    expect(server.getSubscriberCount()).toBe(1)

    server.joinPresence({
      sessionId: parseSessionId('prs_presence_reset'),
      noteId: database.listNotes()[0]!.id,
      userId: parseUserId('usr_admin_1'),
      displayName: 'Admin',
      role: 'ADMIN',
      activity: 'VIEWING',
    })
    expect(server.getPresenceSessionCount()).toBe(1)

    resetRealtimeEnvironmentForTests()
    expect(server.getSubscriberCount()).toBe(0)
    expect(server.getPresenceSessionCount()).toBe(0)
    unsub()
  })

  it('clears sessionStorage lastEventId', () => {
    sessionStorage.setItem(LAST_EVENT_ID_STORAGE_KEY, 'evt_rt_99')
    resetRealtimeEnvironmentForTests()
    expect(sessionStorage.getItem(LAST_EVENT_ID_STORAGE_KEY)).toBeNull()
  })

  it('resets connectivity away from stale OFFLINE/DEGRADED', () => {
    const connectivity = getConnectivityService()
    connectivity.start()
    connectivity.markOffline()
    expect(connectivity.getSnapshot().kind).toBe('OFFLINE')
    resetRealtimeEnvironmentForTests()
    resetConnectivityServiceForTests()
    const next = getConnectivityService()
    next.start()
    next.markOnline()
    expect(next.getSnapshot().kind).toBe('ONLINE')
  })
})
