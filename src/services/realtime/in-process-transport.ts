import type { RealtimeEventId } from '@/domain/ids'
import type { RealtimeEventDto } from '@/domain/schemas/realtime'
import type { RealtimeServer } from '@/mock/realtime/realtime-server'
import type { ActorContext } from '@/mock/services/seed-service'
import { parseRealtimeEvent } from '@/services/realtime/realtime-events'
import type {
  RealtimeTransport,
  RealtimeTransportConnectOptions,
} from '@/services/realtime/realtime-transport'

export type InProcessRealtimeTransportOptions =
  | {
      readonly server: RealtimeServer
      readonly getActor: () => ActorContext
    }
  | {
      readonly connect: (input: {
        readonly lastEventId: RealtimeEventId | null
        readonly onEvent: (event: RealtimeEventDto) => void
        readonly signal: AbortSignal
      }) => () => void
    }

/**
 * Direct in-process transport for unit tests and DEV bridges.
 * Does not use EventSource.
 */
export class InProcessRealtimeTransport implements RealtimeTransport {
  readonly #options: InProcessRealtimeTransportOptions

  constructor(options: InProcessRealtimeTransportOptions) {
    this.#options = options
  }

  connect(options: RealtimeTransportConnectOptions): void {
    options.onStateChange('CONNECTING')

    let unsubscribe: (() => void) | null = null
    const onAbort = () => {
      unsubscribe?.()
      unsubscribe = null
      options.onStateChange('DISCONNECTED')
    }

    if (options.signal.aborted) {
      options.onStateChange('DISCONNECTED')
      return
    }

    options.signal.addEventListener('abort', onAbort, { once: true })

    const deliver = (raw: RealtimeEventDto) => {
      const parsed = parseRealtimeEvent(raw)
      if (!parsed) {
        return
      }
      options.onEvent(parsed)
    }

    if ('server' in this.#options) {
      unsubscribe = this.#options.server.connect({
        actor: this.#options.getActor(),
        lastEventId: options.lastEventId,
        onEvent: deliver,
      })
    } else {
      unsubscribe = this.#options.connect({
        lastEventId: options.lastEventId,
        onEvent: deliver,
        signal: options.signal,
      })
    }

    options.onStateChange('CONNECTED')
  }
}
