import type { RealtimeEventId } from '@/domain/ids'
import { type RealtimeEventDto, realtimeEventDtoSchema } from '@/domain/schemas/realtime'

export type RealtimeConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'RESYNCING'
  | 'DEGRADED'
  | 'UNAVAILABLE'

export { type RealtimeEventDto, realtimeEventDtoSchema }

export function parseRealtimeEvent(value: unknown): RealtimeEventDto | null {
  const parsed = realtimeEventDtoSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/**
 * Logs contract violations without emitting clinical content.
 * Intended for dev/test diagnostics only.
 */
export function reportMalformedRealtimeEvent(input: {
  readonly reason: string
  readonly eventId?: RealtimeEventId | string | null
  readonly eventType?: string | null
  readonly sequence?: number | null
}): void {
  console.debug('[realtime] malformed event', {
    reason: input.reason,
    eventId: input.eventId ?? null,
    eventType: input.eventType ?? null,
    sequence: input.sequence ?? null,
  })
}
