import type { RealtimeEventId } from '@/domain/ids'
import type { RealtimeEventDto } from '@/domain/schemas/realtime'
import type { RealtimeConnectionState } from '@/services/realtime/realtime-events'

export type { RealtimeConnectionState }

export type RealtimeTransportConnectOptions = {
  readonly lastEventId: RealtimeEventId | null
  readonly signal: AbortSignal
  readonly onEvent: (event: RealtimeEventDto) => void
  readonly onStateChange: (state: RealtimeConnectionState) => void
  readonly getActorHeaders?: () => Record<string, string>
}

export interface RealtimeTransport {
  connect(options: RealtimeTransportConnectOptions): Promise<void> | void
  /** Optional hard close for EventSource / mock streams. */
  disconnect?(): void
}
