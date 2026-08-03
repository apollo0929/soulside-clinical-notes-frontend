import { createContext, createElement, type ReactNode, useContext, useMemo } from 'react'

import type { UserRole } from '@/domain/roles'
import type { TelemetryEvent } from '@/domain/schemas/telemetry'
import { getActorIdentity } from '@/services/api/actor-provider'
import { createNoopTelemetryClient } from '@/services/telemetry/noop-telemetry-client'
import {
  getActiveTelemetryClient,
  getActiveTelemetryCoordinator,
  getTelemetryFactoryContext,
  subscribeTelemetryReady,
} from '@/services/telemetry/telemetry-bootstrap'
import type { TelemetryClient } from '@/services/telemetry/telemetry-client'
import {
  createBrowserTelemetryClock,
  createBrowserTelemetryIdGenerator,
  type TelemetryFactoryContext,
} from '@/services/telemetry/telemetry-factories'
import { getOrCreateTelemetrySessionId } from '@/services/telemetry/telemetry-session'

const TelemetryClientContext = createContext<TelemetryClient | null>(null)

export type TelemetryProviderProps = {
  readonly client?: TelemetryClient
  readonly children: ReactNode
}

/**
 * Optional override provider. App bootstrap installs the real client; tests may inject no-op.
 */
export function TelemetryProvider({ client, children }: TelemetryProviderProps) {
  const value = useMemo(() => client ?? null, [client])
  return createElement(TelemetryClientContext.Provider, { value }, children)
}

export function useTelemetryClient(): TelemetryClient {
  const override = useContext(TelemetryClientContext)
  return override ?? getActiveTelemetryClient()
}

function resolveFactoryContext(actorRole?: UserRole): TelemetryFactoryContext {
  const existing = getTelemetryFactoryContext()
  if (existing) {
    return actorRole ? { ...existing, actorRole } : existing
  }
  const actor = getActorIdentity()
  return {
    sessionId: getOrCreateTelemetrySessionId(),
    actorRole: actorRole ?? actor.role,
    clock: createBrowserTelemetryClock(),
    ids: createBrowserTelemetryIdGenerator(),
  }
}

/**
 * Track a factory-built event. Never throws. Uses no-op when telemetry is unavailable.
 * If bootstrap has not finished, events are held briefly and flushed once the client is ready.
 */
const MAX_PENDING_UNTIL_READY = 50
const pendingUntilReady: TelemetryEvent[] = []
let pendingFlushScheduled = false
let pendingReadyUnsub: (() => void) | null = null

function flushPending(client: TelemetryClient): void {
  const queued = pendingUntilReady.splice(0, pendingUntilReady.length)
  for (const event of queued) {
    client.track(event)
  }
}

function clearPendingReadySubscription(): void {
  pendingReadyUnsub?.()
  pendingReadyUnsub = null
  pendingFlushScheduled = false
}

export function trackTelemetry(
  build: (ctx: TelemetryFactoryContext) => TelemetryEvent,
  client?: TelemetryClient,
): void {
  try {
    const event = build(resolveFactoryContext())
    const resolved = client ?? getActiveTelemetryClient()
    if (!client && getActiveTelemetryCoordinator() === null) {
      if (pendingUntilReady.length >= MAX_PENDING_UNTIL_READY) {
        pendingUntilReady.shift()
      }
      pendingUntilReady.push(event)
      if (!pendingFlushScheduled) {
        pendingFlushScheduled = true
        pendingReadyUnsub = subscribeTelemetryReady(() => {
          clearPendingReadySubscription()
          const ready = getActiveTelemetryCoordinator()
          if (ready) {
            flushPending(ready)
          } else {
            pendingUntilReady.length = 0
          }
        })
      }
      return
    }
    resolved.track(event)
  } catch {
    // isolated
  }
}

export function useTrackTelemetry(): {
  readonly track: (build: (ctx: TelemetryFactoryContext) => TelemetryEvent) => void
  readonly client: TelemetryClient
} {
  const client = useTelemetryClient()
  return {
    client,
    track: (build) => trackTelemetry(build, client),
  }
}

export { createNoopTelemetryClient }
