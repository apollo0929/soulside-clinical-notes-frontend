import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'

export type MockClock = {
  now: () => IsoDateTime
}

export class FixedMockClock implements MockClock {
  private current: IsoDateTime

  constructor(initial: IsoDateTime = parseIsoDateTime('2024-07-01T00:00:00.000Z')) {
    this.current = initial
  }

  now(): IsoDateTime {
    return this.current
  }

  set(now: IsoDateTime): void {
    this.current = now
  }

  advanceMs(offsetMs: number): IsoDateTime {
    const next = parseIsoDateTime(new Date(Date.parse(this.current) + offsetMs).toISOString())
    this.current = next
    return next
  }
}
