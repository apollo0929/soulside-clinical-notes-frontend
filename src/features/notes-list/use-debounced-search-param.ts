import { useEffect, useState } from 'react'

export const DEFAULT_SEARCH_DEBOUNCE_MS = 400

type UseDebouncedValueOptions = {
  readonly delayMs?: number
}

/**
 * Debounces a value for URL/query updates. Cancels pending timers on unmount
 * and when the value changes before the delay elapses.
 * Empty string clears immediately so Clear filters / clear-search stay predictable.
 */
export function useDebouncedValue<T>(value: T, options: UseDebouncedValueOptions = {}): T {
  const delayMs = options.delayMs ?? DEFAULT_SEARCH_DEBOUNCE_MS
  const [debounced, setDebounced] = useState(value)

  const shouldClearImmediately = typeof value === 'string' && value.trim() === ''
  if (shouldClearImmediately && debounced !== value) {
    setDebounced(value)
  }

  useEffect(() => {
    if (typeof value === 'string' && value.trim() === '') {
      return
    }

    const timer = window.setTimeout(() => {
      setDebounced(value)
    }, delayMs)
    return () => {
      window.clearTimeout(timer)
    }
  }, [value, delayMs])

  return debounced
}
