import type { RealtimeEventDto } from '@/domain/schemas/realtime'

export const DEFAULT_REALTIME_EVENT_LOG_CAPACITY = 500

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

export type RealtimeEventDraft = DistributiveOmit<RealtimeEventDto, 'sequence'>

export type ReplayFromResult =
  | { readonly ok: true; readonly events: readonly RealtimeEventDto[] }
  | { readonly ok: false; readonly reason: 'CURSOR_EVICTED' | 'UNKNOWN_CURSOR' }

/**
 * Bounded ring buffer of realtime events for missed-event replay.
 * Retention: last {@link capacity} events (default 500). Older cursors → RESYNC_REQUIRED.
 */
export class RealtimeEventLog {
  readonly #capacity: number
  readonly #events: RealtimeEventDto[] = []
  #nextSequence = 1

  constructor(capacity: number = DEFAULT_REALTIME_EVENT_LOG_CAPACITY) {
    if (capacity < 1) {
      throw new Error('RealtimeEventLog capacity must be >= 1')
    }
    this.#capacity = capacity
  }

  get capacity(): number {
    return this.#capacity
  }

  get size(): number {
    return this.#events.length
  }

  get nextSequence(): number {
    return this.#nextSequence
  }

  append(event: RealtimeEventDraft & { readonly sequence?: number }): RealtimeEventDto {
    const sequence = event.sequence ?? this.#nextSequence
    if (sequence < this.#nextSequence) {
      throw new Error(
        `Realtime sequence must be monotonic (got ${sequence}, next ${this.#nextSequence})`,
      )
    }
    this.#nextSequence = sequence + 1
    const stored = Object.freeze({ ...event, sequence }) as RealtimeEventDto
    this.#events.push(stored)
    while (this.#events.length > this.#capacity) {
      this.#events.shift()
    }
    return stored
  }

  getByEventId(eventId: string): RealtimeEventDto | null {
    return this.#events.find((event) => event.eventId === eventId) ?? null
  }

  /**
   * Replay events strictly after `lastEventId`.
   * Empty lastEventId → all retained events.
   */
  replayAfter(lastEventId: string | null): ReplayFromResult {
    if (lastEventId === null || lastEventId === '') {
      return { ok: true, events: [...this.#events] }
    }
    const index = this.#events.findIndex((event) => event.eventId === lastEventId)
    if (index === -1) {
      // Cursor may be ahead of an empty log (fresh server) or fully evicted.
      if (this.#events.length === 0) {
        return { ok: true, events: [] }
      }
      return { ok: false, reason: 'CURSOR_EVICTED' }
    }
    return { ok: true, events: this.#events.slice(index + 1) }
  }

  clear(): void {
    this.#events.length = 0
    this.#nextSequence = 1
  }

  /** Test helper */
  listAll(): readonly RealtimeEventDto[] {
    return [...this.#events]
  }
}
