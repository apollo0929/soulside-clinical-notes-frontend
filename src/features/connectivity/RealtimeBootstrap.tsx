import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'

import { ensureRealtimeBootstrap } from '@/services/realtime/realtime-bootstrap'

/**
 * Boots the application-scoped realtime coordinator (one connection).
 * Idempotent under Strict Mode.
 */
export function RealtimeBootstrap() {
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
