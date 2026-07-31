/**
 * Mulberry32 — small deterministic PRNG.
 * Same seed always yields the same sequence; does not use Math.random.
 */
export type DeterministicRandom = {
  readonly next: () => number
  readonly nextInt: (minInclusive: number, maxExclusive: number) => number
  readonly nextBool: (probability?: number) => boolean
  readonly pick: <T>(items: readonly T[]) => T
}

export function createMulberry32(seed: number): DeterministicRandom {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const nextInt = (minInclusive: number, maxExclusive: number): number => {
    if (maxExclusive <= minInclusive) {
      throw new Error('nextInt requires maxExclusive > minInclusive')
    }
    return minInclusive + Math.floor(next() * (maxExclusive - minInclusive))
  }

  const nextBool = (probability = 0.5): boolean => next() < probability

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty list')
    }
    const index = nextInt(0, items.length)
    const item = items[index]
    if (item === undefined) {
      throw new Error('PRNG pick produced an out-of-range index')
    }
    return item
  }

  return { next, nextInt, nextBool, pick }
}
