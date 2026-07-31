import { createMockApiError, type MockApiError } from '@/mock/errors'
import type { DeterministicRandom } from '@/mock/prng'

export type LatencyOptions = {
  readonly minMs: number
  readonly maxMs: number
  readonly random: DeterministicRandom
}

export type LatencyWaitInput = {
  readonly signal?: AbortSignal | undefined
}

const DEFAULT_MIN_MS = 100
const DEFAULT_MAX_MS = 800

export class LatencyController {
  private minMs: number
  private maxMs: number
  private readonly random: DeterministicRandom

  constructor(options: LatencyOptions) {
    this.minMs = options.minMs
    this.maxMs = options.maxMs
    this.random = options.random
    this.assertRange()
  }

  static createDefault(random: DeterministicRandom): LatencyController {
    return new LatencyController({
      minMs: DEFAULT_MIN_MS,
      maxMs: DEFAULT_MAX_MS,
      random,
    })
  }

  setRange(minMs: number, maxMs: number): void {
    this.minMs = minMs
    this.maxMs = maxMs
    this.assertRange()
  }

  /** Disables simulated latency (tests). */
  disable(): void {
    this.minMs = 0
    this.maxMs = 0
  }

  chooseDurationMs(): number {
    if (this.minMs === 0 && this.maxMs === 0) {
      return 0
    }
    if (this.minMs === this.maxMs) {
      return this.minMs
    }
    return this.random.nextInt(this.minMs, this.maxMs + 1)
  }

  async wait(input: LatencyWaitInput = {}): Promise<void> {
    const { signal } = input
    if (signal?.aborted) {
      throw abortedError()
    }

    const durationMs = this.chooseDurationMs()
    if (durationMs <= 0) {
      return
    }

    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        clearTimeout(timeoutId)
        signal?.removeEventListener('abort', onAbort)
        reject(abortedError())
      }

      const timeoutId = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }, durationMs)

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  private assertRange(): void {
    if (this.minMs < 0 || this.maxMs < 0 || this.maxMs < this.minMs) {
      throw new Error('Latency range must satisfy 0 <= minMs <= maxMs')
    }
  }
}

function abortedError(): MockApiError {
  return createMockApiError({
    code: 'ABORTED',
    status: 499,
    message: 'The mock request was aborted.',
  })
}
