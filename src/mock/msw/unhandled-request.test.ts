import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createDevUnhandledRequestHandler,
  handleDevUnhandledRequest,
  shouldSilentlyBypassUnhandledRequest,
} from '@/mock/msw/unhandled-request'
import {
  ensureDevMockBackend,
  hasDevMockBackendBootstrapStartedForTests,
  resetDevMockBackendBootstrapForTests,
} from '@/services/api/dev-bootstrap'

function requestFor(
  url: string,
  init: { readonly mode?: RequestMode; readonly destination?: RequestDestination } = {},
): Request {
  const request = new Request(url, { mode: 'cors' })
  if (init.mode !== undefined) {
    Object.defineProperty(request, 'mode', { configurable: true, value: init.mode })
  }
  if (init.destination !== undefined) {
    Object.defineProperty(request, 'destination', {
      configurable: true,
      value: init.destination,
    })
  }
  return request
}

describe('MSW unhandled request policy', () => {
  it('bypasses document navigation silently', () => {
    const print = { warning: vi.fn(), error: vi.fn() }
    const navigate = requestFor('http://127.0.0.1:5173/notes', { mode: 'navigate' })
    expect(shouldSilentlyBypassUnhandledRequest(navigate)).toBe(true)
    handleDevUnhandledRequest(navigate, print)
    expect(print.error).not.toHaveBeenCalled()
    expect(print.warning).not.toHaveBeenCalled()

    const documentReq = requestFor('http://127.0.0.1:5173/notes', { destination: 'document' })
    handleDevUnhandledRequest(documentReq, print)
    expect(print.error).not.toHaveBeenCalled()
  })

  it('bypasses Vite assets and toolchain paths silently', () => {
    const print = { warning: vi.fn(), error: vi.fn() }
    const urls = [
      'http://127.0.0.1:5173/@vite/client',
      'http://127.0.0.1:5173/src/main.tsx',
      'http://127.0.0.1:5173/favicon.ico',
      'http://127.0.0.1:5173/src/app/App.tsx.map',
    ]
    for (const url of urls) {
      handleDevUnhandledRequest(requestFor(url), print)
    }
    expect(print.error).not.toHaveBeenCalled()
    expect(print.warning).not.toHaveBeenCalled()
  })

  it('reports unknown /api requests', () => {
    const print = { warning: vi.fn(), error: vi.fn() }
    handleDevUnhandledRequest(requestFor('http://127.0.0.1:5173/api/unknown-endpoint'), print)
    expect(print.error).toHaveBeenCalledTimes(1)
    expect(print.warning).not.toHaveBeenCalled()
  })

  it('createDevUnhandledRequestHandler matches the policy', () => {
    const handler = createDevUnhandledRequestHandler()
    expect(typeof handler).toBe('function')
    if (typeof handler !== 'function') {
      return
    }
    const print = { warning: vi.fn(), error: vi.fn() }
    handler(requestFor('http://127.0.0.1:5173/api/missing'), print)
    expect(print.error).toHaveBeenCalled()
    print.error.mockClear()
    handler(requestFor('http://127.0.0.1:5173/notes', { mode: 'navigate' }), print)
    expect(print.error).not.toHaveBeenCalled()
  })
})

describe('ensureDevMockBackend latch', () => {
  afterEach(async () => {
    await Promise.resolve()
    resetDevMockBackendBootstrapForTests()
  })

  it('starts the bootstrap latch once for concurrent callers', async () => {
    resetDevMockBackendBootstrapForTests()
    expect(hasDevMockBackendBootstrapStartedForTests()).toBe(false)

    const first = ensureDevMockBackend()
    const second = ensureDevMockBackend()
    expect(first).toBe(second)
    expect(hasDevMockBackendBootstrapStartedForTests()).toBe(true)

    // jsdom has no Service Worker; setupWorker fails, but callers still share one attempt.
    await expect(first).rejects.toThrow(/non-browser environment|Failed to execute `setupWorker`/i)
    await expect(second).rejects.toThrow(/non-browser environment|Failed to execute `setupWorker`/i)
    await Promise.resolve()
    expect(hasDevMockBackendBootstrapStartedForTests()).toBe(false)
  })
})

describe('development reset API', () => {
  it('does not run resetEnvironment automatically on install', async () => {
    const realtime = await import('@/services/realtime/dev-realtime-api')
    realtime.resetDevRealtimeResetInvocationCountForTests()
    expect(realtime.getDevRealtimeResetInvocationCountForTests()).toBe(0)

    realtime.installDevRealtimeApi()
    expect(realtime.getDevRealtimeResetInvocationCountForTests()).toBe(0)

    const api = (
      globalThis as {
        __SOULSIDE_REALTIME__?: { resetEnvironment: () => void }
      }
    ).__SOULSIDE_REALTIME__
    expect(api?.resetEnvironment).toBeTypeOf('function')

    api?.resetEnvironment()
    expect(realtime.getDevRealtimeResetInvocationCountForTests()).toBe(1)
  })
})
