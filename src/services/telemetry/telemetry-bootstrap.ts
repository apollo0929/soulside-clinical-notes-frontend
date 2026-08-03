import { getActorIdentity } from '@/services/api/actor-provider'
import { getConnectivityService } from '@/services/offline/connectivity'
import { getOfflineDatabase } from '@/services/offline/offline-db'
import { createNoopTelemetryClient } from '@/services/telemetry/noop-telemetry-client'
import { createHttpTelemetryTransport } from '@/services/telemetry/telemetry-api'
import type { TelemetryClient } from '@/services/telemetry/telemetry-client'
import {
  createTelemetryCoordinator,
  type TelemetryCoordinator,
  type TelemetryScheduler,
} from '@/services/telemetry/telemetry-coordinator'
import {
  createBrowserTelemetryClock,
  createBrowserTelemetryIdGenerator,
  type TelemetryFactoryContext,
} from '@/services/telemetry/telemetry-factories'
import { createTelemetryBatchRepository } from '@/services/telemetry/telemetry-repository'
import { getOrCreateTelemetrySessionId } from '@/services/telemetry/telemetry-session'

export type TelemetryBootstrapDeps = {
  readonly client?: TelemetryClient
  readonly scheduler?: TelemetryScheduler
  readonly disabled?: boolean
}

let bootstrapPromise: Promise<TelemetryClient> | null = null
let activeClient: TelemetryClient | null = null
let activeCoordinator: TelemetryCoordinator | null = null
let factoryContext: TelemetryFactoryContext | null = null
let bootstrapEpoch = 0
const readyListeners = new Set<() => void>()

function notifyReady(): void {
  for (const listener of readyListeners) {
    listener()
  }
}

export function subscribeTelemetryReady(listener: () => void): () => void {
  readyListeners.add(listener)
  if (activeClient) {
    queueMicrotask(() => listener())
  }
  return () => {
    readyListeners.delete(listener)
  }
}

/**
 * Idempotent telemetry bootstrap. Safe under React Strict Mode.
 * Does not block rendering; restore/flush is async and best-effort.
 */
export function ensureTelemetryBootstrap(
  deps: TelemetryBootstrapDeps = {},
): Promise<TelemetryClient> {
  if (bootstrapPromise) {
    return bootstrapPromise
  }

  const epoch = bootstrapEpoch
  bootstrapPromise = Promise.resolve().then(async () => {
    if (epoch !== bootstrapEpoch) {
      throw new Error('Telemetry bootstrap cancelled')
    }

    if (deps.disabled) {
      const noop = createNoopTelemetryClient()
      activeClient = noop
      notifyReady()
      return noop
    }

    if (deps.client) {
      activeClient = deps.client
      notifyReady()
      return deps.client
    }

    const db = getOfflineDatabase()
    await db.open()
    if (epoch !== bootstrapEpoch) {
      throw new Error('Telemetry bootstrap cancelled')
    }

    const connectivity = getConnectivityService()
    connectivity.start()

    const coordinator = createTelemetryCoordinator({
      transport: createHttpTelemetryTransport(),
      repository: createTelemetryBatchRepository(db),
      connectivity,
      ...(deps.scheduler ? { scheduler: deps.scheduler } : {}),
    })

    if (activeCoordinator) {
      await activeCoordinator.dispose()
    }

    activeCoordinator = coordinator
    activeClient = coordinator

    const actor = getActorIdentity()
    factoryContext = {
      sessionId: getOrCreateTelemetrySessionId(),
      actorRole: actor.role,
      clock: createBrowserTelemetryClock(),
      ids: createBrowserTelemetryIdGenerator(),
    }

    coordinator.start()
    notifyReady()
    return coordinator
  })

  return bootstrapPromise.catch((error) => {
    bootstrapPromise = null
    if (error instanceof Error && error.message === 'Telemetry bootstrap cancelled') {
      return createNoopTelemetryClient()
    }
    // Never fail app boot because of telemetry.
    const noop = createNoopTelemetryClient()
    activeClient = noop
    notifyReady()
    return noop
  })
}

export function getActiveTelemetryClient(): TelemetryClient {
  return activeClient ?? createNoopTelemetryClient()
}

export function getActiveTelemetryCoordinator(): TelemetryCoordinator | null {
  return activeCoordinator
}

export function getTelemetryFactoryContext(): TelemetryFactoryContext | null {
  if (factoryContext) {
    const actor = getActorIdentity()
    return { ...factoryContext, actorRole: actor.role }
  }
  return null
}

export function resetTelemetryBootstrapForTests(): void {
  bootstrapEpoch += 1
  void activeCoordinator?.dispose()
  activeCoordinator = null
  activeClient = null
  factoryContext = null
  bootstrapPromise = null
  notifyReady()
}

/** DEV/E2E: flush buffered telemetry for deterministic inspection. */
export function installDevTelemetryApi(): void {
  if (!import.meta.env.DEV) {
    return
  }
  ;(
    globalThis as {
      __SOULSIDE_TELEMETRY__?: {
        flush: () => Promise<void>
        getClient: () => TelemetryClient
        forceFailNext: () => void
      }
    }
  ).__SOULSIDE_TELEMETRY__ = {
    flush: async () => {
      await getActiveTelemetryClient().flush('manual')
    },
    getClient: () => getActiveTelemetryClient(),
    forceFailNext: () => {
      // Filled by mock backend registration in browser when available.
    },
  }
}
