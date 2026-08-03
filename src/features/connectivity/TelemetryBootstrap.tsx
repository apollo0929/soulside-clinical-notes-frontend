import { useEffect, useRef } from 'react'

import { ensureTelemetryBootstrap, installDevTelemetryApi } from '@/services/telemetry'

/**
 * Boots the application-scoped telemetry client (one per app).
 * Idempotent under Strict Mode. Failures never block rendering.
 */
export function TelemetryBootstrap() {
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    installDevTelemetryApi()
    void ensureTelemetryBootstrap()
  }, [])

  return null
}
