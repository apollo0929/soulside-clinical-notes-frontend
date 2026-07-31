import type { SectionConflictKind } from './conflict.types'

/**
 * Exact-string three-way classification for one SOAP section.
 * Whitespace is significant; values are never trimmed.
 */
export function classifySectionConflict(input: {
  readonly ancestor: string
  readonly local: string
  readonly server: string
}): SectionConflictKind {
  const { ancestor, local, server } = input
  const localChanged = local !== ancestor
  const serverChanged = server !== ancestor

  if (!localChanged && !serverChanged) {
    return 'UNCHANGED'
  }
  if (localChanged && !serverChanged) {
    return 'LOCAL_ONLY'
  }
  if (!localChanged && serverChanged) {
    return 'SERVER_ONLY'
  }
  if (local === server) {
    return 'SAME_CHANGE'
  }
  return 'CONFLICT'
}
