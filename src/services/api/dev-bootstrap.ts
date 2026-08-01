import { createMockBackendBrowserWorker } from '@/mock/msw/browser'
import { registerActiveMockRealtimeServer } from '@/mock/realtime/active-server'
import { DEFAULT_SEED_CONFIG } from '@/mock/seed/seed'
import { MockBackendService } from '@/mock/services/backend'
import { DEFAULT_DEV_SEED, getAdminActorHeaders } from '@/services/api/actor-provider'

let bootstrapPromise: Promise<void> | null = null

/**
 * Starts the browser MSW worker once and seeds the default development dataset
 * via HTTP (POST /api/dev/seed). Does not reseed on subsequent calls.
 *
 * Seeding lives here — not inside NotesList — so list requests never trigger seed.
 */
export function ensureDevMockBackend(): Promise<void> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  bootstrapPromise = (async () => {
    const backend = new MockBackendService({ autoSeed: false })
    backend.configureForTests()
    registerActiveMockRealtimeServer(backend.realtime)
    const { worker } = createMockBackendBrowserWorker(backend)
    await worker.start({
      onUnhandledRequest: 'bypass',
      quiet: true,
    })

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
          return
        }
        throw new Error(`Development seed failed (${response.status}): ${text}`)
      }
    } catch (error) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return
      }
      // Network abort / TypeError while routes are offline-simulated.
      if (
        error instanceof TypeError ||
        (error instanceof Error && /Failed to fetch|NetworkError|abort/i.test(error.message))
      ) {
        return
      }
      throw error
    }
  })()

  return bootstrapPromise
}

/** Test-only: clear the bootstrap latch. */
export function resetDevMockBackendBootstrapForTests(): void {
  bootstrapPromise = null
}
