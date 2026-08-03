import {
  ACTOR_USER_ID_HEADER,
  ACTOR_USER_ROLE_HEADER,
  getActorHeaders,
} from '@/services/api/actor-provider'
import {
  parseRealtimeEvent,
  reportMalformedRealtimeEvent,
} from '@/services/realtime/realtime-events'
import {
  classifyRealtimeContentTypeFailure,
  classifyRealtimeHttpFailure,
  classifyRealtimeNetworkError,
} from '@/services/realtime/realtime-failure'
import type {
  RealtimeTransport,
  RealtimeTransportConnectOptions,
} from '@/services/realtime/realtime-transport'

const DEFAULT_STREAM_PATH = '/api/realtime/stream'

/**
 * Fetch-based SSE adapter.
 * Uses fetch (not EventSource) so HTTP 404/403/etc. are classifiable and
 * non-retryable failures do not loop forever.
 */
export class SseRealtimeTransport implements RealtimeTransport {
  readonly #streamPath: string
  #activeAbort: AbortController | null = null

  constructor(options: { readonly streamPath?: string } = {}) {
    this.#streamPath = options.streamPath ?? DEFAULT_STREAM_PATH
  }

  connect(options: RealtimeTransportConnectOptions): void {
    this.disconnect()
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

    const localAbort = new AbortController()
    this.#activeAbort = localAbort

    const onOuterAbort = () => {
      localAbort.abort()
    }
    if (options.signal.aborted) {
      options.onStateChange('DISCONNECTED')
      return
    }
    options.signal.addEventListener('abort', onOuterAbort, { once: true })

    void (async () => {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'text/event-stream',
          },
          signal: localAbort.signal,
        })

        if (localAbort.signal.aborted || options.signal.aborted) {
          return
        }

        if (!response.ok) {
          const failure = classifyRealtimeHttpFailure(response.status)
          options.onFailure?.(failure)
          options.onStateChange(failure.kind === 'retryable' ? 'RECONNECTING' : 'UNAVAILABLE')
          return
        }

        const contentType = response.headers.get('content-type') ?? ''
        if (!contentType.toLowerCase().includes('text/event-stream')) {
          const failure = classifyRealtimeContentTypeFailure()
          options.onFailure?.(failure)
          options.onStateChange('UNAVAILABLE')
          return
        }

        options.onStateChange('CONNECTED')

        const body = response.body
        if (!body) {
          const failure = classifyRealtimeContentTypeFailure()
          options.onFailure?.(failure)
          options.onStateChange('UNAVAILABLE')
          return
        }

        await this.#readSseStream(body, options, localAbort.signal)
      } catch (error) {
        if (localAbort.signal.aborted || options.signal.aborted) {
          options.onStateChange('DISCONNECTED')
          return
        }
        const failure = classifyRealtimeNetworkError()
        options.onFailure?.(failure)
        options.onStateChange('RECONNECTING')
        void error
      } finally {
        options.signal.removeEventListener('abort', onOuterAbort)
        if (this.#activeAbort === localAbort) {
          this.#activeAbort = null
        }
      }
    })()
  }

  disconnect(): void {
    this.#activeAbort?.abort()
    this.#activeAbort = null
  }

  async #readSseStream(
    body: ReadableStream<Uint8Array>,
    options: RealtimeTransportConnectOptions,
    signal: AbortSignal,
  ): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read()
        if (done) {
          if (!signal.aborted) {
            options.onStateChange('RECONNECTING')
          }
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split('\n\n')
        buffer = chunks.pop() ?? ''
        for (const chunk of chunks) {
          this.#dispatchSseChunk(chunk, options)
        }
      }
    } catch {
      if (!signal.aborted) {
        options.onFailure?.(classifyRealtimeNetworkError())
        options.onStateChange('RECONNECTING')
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // already released
      }
    }
  }

  #dispatchSseChunk(chunk: string, options: RealtimeTransportConnectOptions): void {
    const dataLines: string[] = []
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart())
      }
    }
    if (dataLines.length === 0) {
      return
    }
    const raw = dataLines.join('\n')
    let payload: unknown = raw
    try {
      payload = JSON.parse(raw) as unknown
    } catch {
      reportMalformedRealtimeEvent({ reason: 'invalid_json' })
      return
    }
    const parsed = parseRealtimeEvent(payload)
    if (!parsed) {
      reportMalformedRealtimeEvent({ reason: 'schema_validation_failed' })
      return
    }
    options.onEvent(parsed)
  }
}
