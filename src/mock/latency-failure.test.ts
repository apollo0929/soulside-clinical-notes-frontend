import { describe, expect, it } from 'vitest'

import { createMockApiError, isMockApiError } from '@/mock/errors'
import { FailureController } from '@/mock/failure'
import { LatencyController } from '@/mock/latency'
import { createMulberry32 } from '@/mock/prng'

describe('latency and failure controls', () => {
  it('45: latency can be disabled in tests', async () => {
    const latency = LatencyController.createDefault(createMulberry32(1))
    latency.disable()
    expect(latency.chooseDurationMs()).toBe(0)
    await expect(latency.wait()).resolves.toBeUndefined()
  })

  it('46: deterministic latency produces repeatable duration choice', () => {
    const a = new LatencyController({ minMs: 100, maxMs: 800, random: createMulberry32(42) })
    const b = new LatencyController({ minMs: 100, maxMs: 800, random: createMulberry32(42) })
    const durationsA = [a.chooseDurationMs(), a.chooseDurationMs(), a.chooseDurationMs()]
    const durationsB = [b.chooseDurationMs(), b.chooseDurationMs(), b.chooseDurationMs()]
    expect(durationsA).toEqual(durationsB)
  })

  it('47: abort signal rejects as ABORTED', async () => {
    const latency = new LatencyController({
      minMs: 1000,
      maxMs: 1000,
      random: createMulberry32(1),
    })
    const controller = new AbortController()
    const pending = latency.wait({ signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('48–50: failure rate 0 never injects; 1 always; sequence reproducible', () => {
    const never = new FailureController({ random: createMulberry32(9), defaultRate: 0 })
    for (let i = 0; i < 50; i += 1) {
      expect(never.shouldFail()).toBe(false)
    }

    const always = new FailureController({ random: createMulberry32(9), defaultRate: 1 })
    for (let i = 0; i < 20; i += 1) {
      expect(always.shouldFail()).toBe(true)
    }

    const a = new FailureController({ random: createMulberry32(77), defaultRate: 0.5 })
    const b = new FailureController({ random: createMulberry32(77), defaultRate: 0.5 })
    const seqA = Array.from({ length: 30 }, () => a.shouldFail())
    const seqB = Array.from({ length: 30 }, () => b.shouldFail())
    expect(seqA).toEqual(seqB)

    always.forceAlways()
    expect(() => always.maybeInject()).toThrow()
    try {
      always.maybeInject()
    } catch (error) {
      expect(isMockApiError(error)).toBe(true)
      if (isMockApiError(error)) {
        expect(error.code).toBe('SIMULATED_INTERNAL_ERROR')
        expect(error.status).toBe(500)
      }
    }

    expect(createMockApiError({ code: 'ABORTED', status: 499, message: 'x' }).code).toBe('ABORTED')
  })
})
