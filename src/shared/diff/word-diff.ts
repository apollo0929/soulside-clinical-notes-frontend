/**
 * Pure word-level diff. No DOM dependency; package-free LCS over tokenized words.
 * Tokens keep whitespace so rendering can preserve readable spacing.
 */

export type WordDiffSegment =
  | {
      readonly kind: 'UNCHANGED'
      readonly value: string
    }
  | {
      readonly kind: 'ADDED'
      readonly value: string
    }
  | {
      readonly kind: 'REMOVED'
      readonly value: string
    }

function tokenize(text: string): readonly string[] {
  if (text.length === 0) {
    return []
  }
  const tokens = text.match(/\S+|\s+/g)
  return tokens ?? [text]
}

function buildLcsTable(a: readonly string[], b: readonly string[]): number[][] {
  const rows = a.length
  const cols = b.length
  const table: number[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols + 1 }, () => 0),
  )
  for (let i = 1; i <= rows; i += 1) {
    for (let j = 1; j <= cols; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        table[i]![j] = table[i - 1]![j - 1]! + 1
      } else {
        table[i]![j] = Math.max(table[i - 1]![j]!, table[i]![j - 1]!)
      }
    }
  }
  return table
}

function pushSegment(
  segments: WordDiffSegment[],
  kind: WordDiffSegment['kind'],
  value: string,
): void {
  if (value.length === 0) {
    return
  }
  const last = segments[segments.length - 1]
  if (last && last.kind === kind) {
    segments[segments.length - 1] = Object.freeze({ kind, value: last.value + value })
    return
  }
  segments.push(Object.freeze({ kind, value }))
}

/**
 * Diff `base` (older) against `compare` (newer).
 * REMOVED = present in base only; ADDED = present in compare only.
 */
export function diffWords(base: string, compare: string): readonly WordDiffSegment[] {
  if (base === compare) {
    if (base.length === 0) {
      return Object.freeze([])
    }
    return Object.freeze([Object.freeze({ kind: 'UNCHANGED' as const, value: base })])
  }

  const a = tokenize(base)
  const b = tokenize(compare)
  const table = buildLcsTable(a, b)
  const raw: WordDiffSegment[] = []

  let i = a.length
  let j = b.length
  const stack: WordDiffSegment[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      stack.push(Object.freeze({ kind: 'UNCHANGED', value: a[i - 1]! }))
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || table[i]![j - 1]! >= table[i - 1]![j]!)) {
      stack.push(Object.freeze({ kind: 'ADDED', value: b[j - 1]! }))
      j -= 1
    } else if (i > 0) {
      stack.push(Object.freeze({ kind: 'REMOVED', value: a[i - 1]! }))
      i -= 1
    }
  }

  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const segment = stack[index]!
    pushSegment(raw, segment.kind, segment.value)
  }

  return Object.freeze(raw.map((segment) => Object.freeze({ ...segment })))
}
