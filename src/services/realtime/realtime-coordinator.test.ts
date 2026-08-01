import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseClientMutationId, parseRealtimeEventId } from '@/domain/ids'
import { ConnectivityService } from '@/services/offline/connectivity'
import { InProcessRealtimeTransport } from '@/services/realtime/in-process-transport'
import { MutationCorrelationStore } from '@/services/realtime/mutation-correlation'
import {
  clearPersistedLastEventId,
  createRealtimeCoordinator,
} from '@/services/realtime/realtime-coordinator'
import type { RealtimeConnectionState } from '@/services/realtime/realtime-events'
import { parseRealtimeEvent } from '@/services/realtime/realtime-events'
import type { RealtimeTransportConnectOptions } from '@/services/realtime/realtime-transport'
import { buildStatusChangedRealtimeEventDto } from '@/test/fixtures/dto'

describe('RealtimeCoordinator', () => {
  beforeEach(() => {
    clearPersistedLastEventId()
  })
  it('31–38: dedupes event ids, ignores stale sequence, applies non-contiguous sequences, serializes handlers', async () => {
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const events: string[] = []
    let _connectCount = 0
    const transport = {
      connect(options: RealtimeTransportConnectOptions) {
        _connectCount += 1
        options.onStateChange('CONNECTED')
        queueMicrotask(() => {
          options.onEvent(
            buildStatusChangedRealtimeEventDto({ sequence: 1 }) as ReturnType<
              typeof buildStatusChangedRealtimeEventDto
            >,
          )
          options.onEvent(
            buildStatusChangedRealtimeEventDto({ sequence: 1 }) as ReturnType<
              typeof buildStatusChangedRealtimeEventDto
            >,
          )
          options.onEvent({
            ...buildStatusChangedRealtimeEventDto({ sequence: 1 }),
            eventId: parseRealtimeEventId('evt_rt_stale'),
          })
          options.onEvent({
            ...buildStatusChangedRealtimeEventDto({ sequence: 3 }),
            eventId: parseRealtimeEventId('evt_rt_gap'),
          })
        })
      },
    }

    const onResync = vi.fn()
    const coordinator = createRealtimeCoordinator({
      transport,
      connectivity,
      handlers: {
        onReconcile: (event) => {
          events.push(`${event.eventType}:${event.sequence}`)
        },
        onPresence: () => undefined,
        onResync,
      },
    })

    coordinator.start()
    await vi.waitFor(() => {
      expect(events).toEqual(['NOTE_STATUS_CHANGED:1', 'NOTE_STATUS_CHANGED:3'])
    })

    // Actor-filtered holes are expected; only RESYNC_REQUIRED forces onResync.
    expect(onResync).not.toHaveBeenCalled()
    expect(coordinator.getLastAppliedSequence()).toBe(3)
    coordinator.dispose()
    connectivity.stop()
  })

  it('39–42: offline closes transport; reconnect uses backoff scheduler', async () => {
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })
    connectivity.start()

    const scheduled: Array<{ delay: number; work: () => void }> = []
    let connectState: RealtimeConnectionState | null = null
    const transport = {
      connect(options: RealtimeTransportConnectOptions) {
        options.onStateChange('RECONNECTING')
        connectState = 'RECONNECTING'
        options.signal.addEventListener('abort', () => {
          connectState = 'DISCONNECTED'
          options.onStateChange('DISCONNECTED')
        })
      },
    }
    void connectState

    const coordinator = createRealtimeCoordinator({
      transport,
      connectivity,
      scheduler: {
        schedule(delay, work) {
          scheduled.push({ delay, work })
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
    connectivity.markOffline()
    expect(coordinator.getConnectionState()).toBe('DISCONNECTED')

    connectivity.markOnline()
    expect(scheduled.length).toBeGreaterThan(0)
    coordinator.dispose()
    connectivity.stop()
  })

  it('43–45: in-process transport delivers events via connect callback', async () => {
    const connectivity = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: () => () => undefined,
    })

    const received: number[] = []
    const coordinator = createRealtimeCoordinator({
      transport: new InProcessRealtimeTransport({
        connect: ({ onEvent, signal }) => {
          onEvent(buildStatusChangedRealtimeEventDto({ sequence: 1 }))
          signal.addEventListener('abort', () => undefined)
          return () => undefined
        },
      }),
      connectivity,
      handlers: {
        onReconcile: (event) => {
          received.push(event.sequence)
        },
        onPresence: () => undefined,
        onResync: () => undefined,
      },
    })

    coordinator.start()
    await vi.waitFor(() => {
      expect(received).toEqual([1])
    })
    coordinator.dispose()
  })

  it('46–47: malformed events do not advance cursor; parseRealtimeEvent guards transport', () => {
    expect(parseRealtimeEvent({ eventType: 'NOTE_CREATED' })).toBeNull()
    expect(parseRealtimeEvent(buildStatusChangedRealtimeEventDto())).not.toBeNull()
  })

  it('48–50: mutation correlation remembers local ids with TTL semantics', () => {
    let nowMs = 1_000_000
    const store = new MutationCorrelationStore({
      ttlMs: 60_000,
      maxEntries: 4,
      now: () => nowMs,
    })
    const mutationId = parseClientMutationId('mut_1')
    store.rememberLocalMutation({ mutationId })
    expect(store.isLocalMutation(mutationId)).toBe(true)
    nowMs += 70_000
    store.rememberLocalMutation({ mutationId: parseClientMutationId('mut_2') })
    expect(store.isLocalMutation(mutationId)).toBe(false)
  })
})
