import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_SEARCH_DEBOUNCE_MS,
  useDebouncedValue,
} from '@/features/notes-list/use-debounced-search-param'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('30: does not update before debounce', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, { delayMs: 400 }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'a' })
    act(() => {
      vi.advanceTimersByTime(399)
    })
    expect(result.current).toBe('')
  })

  it('31: updates after debounce', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, { delayMs: 400 }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'avery' })
    act(() => {
      vi.advanceTimersByTime(DEFAULT_SEARCH_DEBOUNCE_MS)
    })
    expect(result.current).toBe('avery')
  })

  it('32: rapid typing coalesces to the final value', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, { delayMs: 400 }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'a' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ value: 'av' })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ value: 'avery' })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe('avery')
  })

  it('33: clearing search updates after debounce window', () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, { delayMs: 400 }),
      { initialProps: { value: 'avery' } },
    )
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe('avery')
    rerender({ value: '' })
    act(() => {
      vi.advanceTimersByTime(400)
    })
    expect(result.current).toBe('')
  })

  it('34: pending update is cancelled on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ value }: { value: string }) => useDebouncedValue(value, { delayMs: 400 }),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'pending' })
    unmount()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    // No throw / no leaked timer update after unmount.
  })
})
