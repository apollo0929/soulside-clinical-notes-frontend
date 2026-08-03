import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { isMockBackendEnabled } from '@/services/api/mock-backend-enabled'
import { ensureRealtimeBootstrap } from '@/services/realtime/realtime-bootstrap'

/**
 * Boots the application-scoped realtime coordinator (one connection).
 * Idempotent under Strict Mode. Skipped when the DEV mock backend is disabled.
 */
export function RealtimeBootstrap() {
  if (!isMockBackendEnabled()) {
    return null
  }
  return <RealtimeBootstrapActive />
}

function RealtimeBootstrapActive() {
  const queryClient = useQueryClient()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) {
      return
    }
    started.current = true
    void ensureRealtimeBootstrap(queryClient)
  }, [queryClient])

  return null
}
