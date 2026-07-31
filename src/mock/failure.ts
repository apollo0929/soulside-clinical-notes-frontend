import { createMockApiError, type MockApiError } from '@/mock/errors'
import type { DeterministicRandom } from '@/mock/prng'

export type FailureEndpoint =
  | 'notes.list'
  | 'notes.detail'
  | 'notes.transition'
  | 'notes.createVersion'
  | 'dev.seed'
  | 'default'

export type FailureControllerOptions = {
  readonly random: DeterministicRandom
  readonly defaultRate?: number
  readonly endpointRates?: Readonly<Partial<Record<FailureEndpoint, number>>>
}

export class FailureController {
  private defaultRate: number
  private readonly endpointRates: Map<FailureEndpoint, number>
  private readonly random: DeterministicRandom

  constructor(options: FailureControllerOptions) {
    this.random = options.random
    this.defaultRate = clampRate(options.defaultRate ?? 0.05)
    this.endpointRates = new Map()
    if (options.endpointRates) {
      for (const [endpoint, rate] of Object.entries(options.endpointRates)) {
        if (rate !== undefined) {
          this.endpointRates.set(endpoint as FailureEndpoint, clampRate(rate))
        }
      }
    }
  }

  setDefaultRate(rate: number): void {
    this.defaultRate = clampRate(rate)
  }

  setEndpointRate(endpoint: FailureEndpoint, rate: number): void {
    this.endpointRates.set(endpoint, clampRate(rate))
  }

  /** Never inject failures (tests). */
  disable(): void {
    this.defaultRate = 0
    this.endpointRates.clear()
  }

  /** Always inject failures for the default path (tests). */
  forceAlways(): void {
    this.defaultRate = 1
    this.endpointRates.clear()
  }

  shouldFail(endpoint: FailureEndpoint = 'default'): boolean {
    const rate = this.endpointRates.get(endpoint) ?? this.defaultRate
    if (rate <= 0) {
      return false
    }
    if (rate >= 1) {
      return true
    }
    return this.random.next() < rate
  }

  /**
   * Throws a typed simulated internal error when the failure rate hits.
   */
  maybeInject(endpoint: FailureEndpoint = 'default'): void {
    if (this.shouldFail(endpoint)) {
      throw simulatedInternalError()
    }
  }
}

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new Error('Failure rate must be a finite number between 0 and 1 inclusive')
  }
  return rate
}

function simulatedInternalError(): MockApiError {
  return createMockApiError({
    code: 'SIMULATED_INTERNAL_ERROR',
    status: 500,
    message: 'Simulated internal server error.',
  })
}
