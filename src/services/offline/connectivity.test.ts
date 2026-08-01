import { describe, expect, it, vi } from 'vitest'

import { ConnectivityService } from '@/services/offline/connectivity'

describe('ConnectivityService', () => {
  it('45–47: offline/online events update state; listeners cleaned; singleton start', () => {
    const listeners = new Map<string, () => void>()
    const service = new ConnectivityService({
      getNavigatorOnline: () => true,
      addWindowListener: (type, listener) => {
        listeners.set(type, listener)
        return () => {
          listeners.delete(type)
        }
      },
    })
    const seen: string[] = []
    const unsubscribe = service.subscribe((state) => {
      seen.push(state.kind)
    })
    service.start()
    service.start() // idempotent
    listeners.get('offline')?.()
    expect(service.getSnapshot().kind).toBe('OFFLINE')
    listeners.get('online')?.()
    expect(service.getSnapshot().kind).toBe('RECONNECTING')
    service.markDegraded('request failed')
    expect(service.getSnapshot().kind).toBe('DEGRADED')
    unsubscribe()
    service.stop()
    expect(listeners.size).toBe(0)
    vi.clearAllMocks()
  })
})
