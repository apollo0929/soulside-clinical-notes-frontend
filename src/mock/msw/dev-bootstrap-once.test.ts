import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const start = vi.fn(async () => undefined)

vi.mock('@/mock/msw/browser', () => ({
  createMockBackendBrowserWorker: () => ({
    backend: {
      configureForTests: () => undefined,
      database: {},
      realtime: {},
    },
    worker: { start },
  }),
}))

vi.mock('@/mock/realtime/active-server', () => ({
  registerActiveMockRealtimeServer: () => undefined,
}))

vi.mock('@/services/api/actor-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/api/actor-provider')>()
  return {
    ...actual,
    installDevActorApi: () => undefined,
    getAdminActorHeaders: () => ({}),
  }
})

vi.mock('@/services/realtime/dev-realtime-api', () => ({
  installDevRealtimeApi: () => undefined,
  registerRealtimeDevDatabase: () => undefined,
}))

describe('ensureDevMockBackend worker.start once', () => {
  beforeEach(() => {
    start.mockClear()
    vi.resetModules()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, text: async () => '' }) as Response),
    )
  })

  afterEach(async () => {
    const { resetDevMockBackendBootstrapForTests } = await import('@/services/api/dev-bootstrap')
    resetDevMockBackendBootstrapForTests()
    vi.unstubAllGlobals()
  })

  it('calls worker.start exactly once across repeated ensureDevMockBackend', async () => {
    const { ensureDevMockBackend, hasDevMockWorkerStartedForTests } =
      await import('@/services/api/dev-bootstrap')

    await ensureDevMockBackend()
    await ensureDevMockBackend()
    await ensureDevMockBackend()

    expect(start).toHaveBeenCalledTimes(1)
    expect(hasDevMockWorkerStartedForTests()).toBe(true)
  })
})
