import {
  ACTOR_USER_ID_HEADER,
  ACTOR_USER_ROLE_HEADER,
  getActorHeaders,
} from '@/services/api/actor-provider'
import {
  parseRealtimeEvent,
  reportMalformedRealtimeEvent,
} from '@/services/realtime/realtime-events'
import type {
  RealtimeTransport,
  RealtimeTransportConnectOptions,
} from '@/services/realtime/realtime-transport'

const DEFAULT_STREAM_PATH = '/api/realtime/stream'

/**
 * SSE adapter for browser EventSource.
 *
 * EventSource cannot set custom request headers in browsers, so actor identity
 * is passed as query parameters (`x-user-id`, `x-user-role`) for the mock backend.
 */
export class SseRealtimeTransport implements RealtimeTransport {
  readonly #streamPath: string

  constructor(options: { readonly streamPath?: string } = {}) {
    this.#streamPath = options.streamPath ?? DEFAULT_STREAM_PATH
  }

  connect(options: RealtimeTransportConnectOptions): void {
    if (typeof EventSource === 'undefined') {
      options.onStateChange('DISCONNECTED')
      return
    }

    options.onStateChange('CONNECTING')

    const headers = options.getActorHeaders?.() ?? getActorHeaders()
    const params = new URLSearchParams()
    if (options.lastEventId) {
      params.set('lastEventId', String(options.lastEventId))
    }
    const userId = headers[ACTOR_USER_ID_HEADER]
    const role = headers[ACTOR_USER_ROLE_HEADER]
    if (userId) {
      params.set(ACTOR_USER_ID_HEADER, userId)
    }
    if (role) {
      params.set(ACTOR_USER_ROLE_HEADER, role)
    }

    const query = params.toString()
    const url = query.length > 0 ? `${this.#streamPath}?${query}` : this.#streamPath
    const source = new EventSource(url)

    const close = () => {
      source.close()
      options.onStateChange('DISCONNECTED')
    }

    source.onopen = () => {
      if (options.signal.aborted) {
        close()
        return
      }
      options.onStateChange('CONNECTED')
    }

    source.onerror = () => {
      if (options.signal.aborted) {
        close()
        return
      }
      // Close so the browser does not auto-recover this EventSource while the
      // coordinator owns reconnect/backoff.
      source.close()
      options.onStateChange('RECONNECTING')
    }

    source.onmessage = (message) => {
      if (options.signal.aborted) {
        return
      }
      let payload: unknown = message.data
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload) as unknown
        } catch {
          reportMalformedRealtimeEvent({ reason: 'invalid_json' })
          return
        }
      }
      const parsed = parseRealtimeEvent(payload)
      if (!parsed) {
        reportMalformedRealtimeEvent({ reason: 'schema_validation_failed' })
        return
      }
      options.onEvent(parsed)
    }

    options.signal.addEventListener(
      'abort',
      () => {
        source.close()
        options.onStateChange('DISCONNECTED')
      },
      { once: true },
    )

    if (options.signal.aborted) {
      source.close()
      options.onStateChange('DISCONNECTED')
    }
  }
}
