import { createMockBackendBrowserWorker } from '@/mock/msw/browser'
import { createDevUnhandledRequestHandler } from '@/mock/msw/unhandled-request'
import { registerActiveMockRealtimeServer } from '@/mock/realtime/active-server'
import { DEFAULT_SEED_CONFIG } from '@/mock/seed/seed'
import { MockBackendService } from '@/mock/services/backend'
import { DEFAULT_DEV_SEED, getAdminActorHeaders } from '@/services/api/actor-provider'
import { isMockBackendEnabled } from '@/services/api/mock-backend-enabled'

export { isMockBackendEnabled } from '@/services/api/mock-backend-enabled'

const DEV_MSW_GLOBAL_KEY = '__SOULSIDE_DEV_MSW_BOOTSTRAP__' as const

type DevMswBootstrapState = {
  readonly promise: Promise<void>
  workerStarted: boolean
}

function getGlobalBootstrapState(): DevMswBootstrapState | undefined {
  return (globalThis as unknown as Record<string, DevMswBootstrapState | undefined>)[
    DEV_MSW_GLOBAL_KEY
  ]
}

function setGlobalBootstrapState(state: DevMswBootstrapState): void {
  ;(globalThis as unknown as Record<string, DevMswBootstrapState | undefined>)[DEV_MSW_GLOBAL_KEY] =
    state
}

/** Module latch (Vitest) + globalThis latch (Vite HMR) so worker.start runs once. */
let bootstrapPromise: Promise<void> | null = null

/**
 * Starts the browser MSW worker once and seeds the default development dataset
 * via HTTP (POST /api/dev/seed). Does not reseed on subsequent calls.
 *
 * Seeding lives here — not inside NotesList — so list requests never trigger seed.
 * Safe under React Strict Mode and Vite HMR re-entry.
 */
export function ensureDevMockBackend(): Promise<void> {
  // Shared mock-backend gate: skip MSW registration when deliberately disabled.
  if (!isMockBackendEnabled()) {
    return Promise.resolve()
  }

  const existingGlobal = getGlobalBootstrapState()
  if (existingGlobal) {
    bootstrapPromise = existingGlobal.promise
    return existingGlobal.promise
  }
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  let resolvePromise!: () => void
  let rejectPromise!: (reason?: unknown) => void
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  const state: DevMswBootstrapState = {
    promise,
    workerStarted: false,
  }
  // Latch synchronously before any await so concurrent callers share one start.
  bootstrapPromise = promise
  setGlobalBootstrapState(state)

  void (async () => {
    try {
      const backend = new MockBackendService({ autoSeed: false })
      backend.configureForTests()
      registerActiveMockRealtimeServer(backend.realtime)
      const { worker } = createMockBackendBrowserWorker(backend)

      await worker.start({
        onUnhandledRequest: createDevUnhandledRequestHandler(),
        quiet: true,
      })
      state.workerStarted = true

      const { installDevActorApi } = await import('@/services/api/actor-provider')
      installDevActorApi()

      const { installDevRealtimeApi, registerRealtimeDevDatabase } =
        await import('@/services/realtime/dev-realtime-api')
      registerRealtimeDevDatabase(backend.database)
      installDevRealtimeApi()

      try {
        const response = await fetch('/api/dev/seed', {
          method: 'POST',
          headers: {
            ...getAdminActorHeaders(),
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            count: DEFAULT_SEED_CONFIG.noteCount,
            seed: DEFAULT_DEV_SEED,
          }),
        })

        if (!response.ok) {
          const text = await response.text()
          // Offline startup may rely on IndexedDB cache without a live seed.
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            resolvePromise()
            return
          }
          throw new Error(`Development seed failed (${response.status}): ${text}`)
        }
      } catch (error) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          resolvePromise()
          return
        }
        // Network abort / TypeError while routes are offline-simulated.
        if (
          error instanceof TypeError ||
          (error instanceof Error && /Failed to fetch|NetworkError|abort/i.test(error.message))
        ) {
          resolvePromise()
          return
        }
        throw error
      }

      resolvePromise()
    } catch (error) {
      rejectPromise(error)
      // Defer latch clear so same-tick concurrent callers still share this promise.
      queueMicrotask(() => {
        if (getGlobalBootstrapState()?.promise === promise) {
          resetDevMockBackendBootstrapForTests()
        }
      })
    }
  })()

  return promise
}

/** Test helper: whether the durable bootstrap latch has been created. */
export function hasDevMockBackendBootstrapStartedForTests(): boolean {
  return bootstrapPromise !== null || getGlobalBootstrapState() !== undefined
}

/** Test helper: whether worker.start completed for the active latch. */
export function hasDevMockWorkerStartedForTests(): boolean {
  return getGlobalBootstrapState()?.workerStarted === true
}

/** Test-only: clear the bootstrap latch (module + globalThis). Does not run in app boot. */
export function resetDevMockBackendBootstrapForTests(): void {
  bootstrapPromise = null
  delete (globalThis as unknown as Record<string, DevMswBootstrapState | undefined>)[
    DEV_MSW_GLOBAL_KEY
  ]
}
