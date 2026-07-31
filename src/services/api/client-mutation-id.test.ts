import { describe, expect, it } from 'vitest'

import {
  createBrowserClientMutationIdGenerator,
  createDeterministicClientMutationIdGenerator,
} from '@/services/api/client-mutation-id'

describe('ClientMutationId generators', () => {
  it('1–2: browser and deterministic generators return branded non-empty ids', () => {
    const browser = createBrowserClientMutationIdGenerator()
    const id = browser.next()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(4)
    expect(id.startsWith('mut_')).toBe(true)

    const deterministic = createDeterministicClientMutationIdGenerator()
    expect(deterministic.next()).toBe('mut_test_1')
    expect(deterministic.next()).toBe('mut_test_2')
  })

  it('3–5: new saves get new ids; sequence is stable for retries to reuse', () => {
    const gen = createDeterministicClientMutationIdGenerator('mut_save')
    const first = gen.next()
    const second = gen.next()
    expect(first).toBe('mut_save_1')
    expect(second).toBe('mut_save_2')
    expect(first).not.toBe(second)
    // Retry reuses by holding the prior id — generator itself only advances on next().
    expect(first).toBe('mut_save_1')
  })

  it('6: generators do not use Math.random', () => {
    const source = createBrowserClientMutationIdGenerator.toString()
    expect(source).not.toMatch(/Math\.random/)
    const det = createDeterministicClientMutationIdGenerator.toString()
    expect(det).not.toMatch(/Math\.random/)
  })
})
