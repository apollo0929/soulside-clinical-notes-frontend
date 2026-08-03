import { useEffect, useRef } from 'react'

import { isMockBackendEnabled } from '@/services/api/mock-backend-enabled'
import { ensureTelemetryBootstrap, installDevTelemetryApi } from '@/services/telemetry'

/**
 * Boots the application-scoped telemetry client (one per app).
 * Idempotent under Strict Mode. Failures never block rendering.
 * Skipped when the DEV mock backend is disabled (avoids 404 retry spam).
 */
export function TelemetryBootstrap() {
  if (!isMockBackendEnabled()) {
    return null
  }
  return <TelemetryBootstrapActive />
}

function TelemetryBootstrapActive() {
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
