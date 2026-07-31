import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteVersion } from '@/domain/models/note-version'

export type VersionGraphIssue = {
  readonly code: 'MISSING_PARENT' | 'CYCLE' | 'NOTE_MISMATCH' | 'UNKNOWN_VERSION'
  readonly message: string
}

export type VersionLookup = {
  readonly get: (id: VersionId) => NoteVersion | null
}

export type AncestorChainResult =
  | {
      readonly ok: true
      readonly chain: readonly VersionId[]
      readonly distanceById: ReadonlyMap<VersionId, number>
    }
  | { readonly ok: false; readonly issue: VersionGraphIssue }

export type CommonAncestorResult =
  | {
      readonly ok: true
      readonly ancestorId: VersionId
    }
  | { readonly ok: false; readonly issue: VersionGraphIssue }
  | { readonly ok: false; readonly code: 'NO_COMMON_ANCESTOR' }

/**
 * Walk parent links from a version toward the root.
 * Detects cycles and missing parents.
 */
export function getAncestorChain(
  startId: VersionId,
  lookup: VersionLookup,
  expectedNoteId: NoteId,
): AncestorChainResult {
  const chain: VersionId[] = []
  const distanceById = new Map<VersionId, number>()
  const visiting = new Set<VersionId>()

  let currentId: VersionId | null = startId
  let distance = 0

  while (currentId !== null) {
    if (visiting.has(currentId)) {
      return {
        ok: false,
        issue: {
          code: 'CYCLE',
          message: `Version parent cycle detected at ${currentId}.`,
        },
      }
    }
    visiting.add(currentId)

    const version = lookup.get(currentId)
    if (!version) {
      return {
        ok: false,
        issue: {
          code: 'UNKNOWN_VERSION',
          message: `Version ${currentId} was not found.`,
        },
      }
    }
    if (version.noteId !== expectedNoteId) {
      return {
        ok: false,
        issue: {
          code: 'NOTE_MISMATCH',
          message: `Version ${currentId} belongs to a different note.`,
        },
      }
    }

    chain.push(currentId)
    distanceById.set(currentId, distance)
    distance += 1

    if (version.parentVersionId === null) {
      currentId = null
    } else {
      const parentId = version.parentVersionId
      if (!lookup.get(parentId)) {
        return {
          ok: false,
          issue: {
            code: 'MISSING_PARENT',
            message: `Version ${currentId} references missing parent ${parentId}.`,
          },
        }
      }
      currentId = parentId
    }
  }

  return { ok: true, chain, distanceById }
}

/**
 * Nearest common ancestor for single-parent version lineages.
 * Walk A to root, then walk B until an A ancestor is found.
 */
export function findNearestCommonAncestor(
  versionAId: VersionId,
  versionBId: VersionId,
  lookup: VersionLookup,
  expectedNoteId: NoteId,
): CommonAncestorResult {
  const versionA = lookup.get(versionAId)
  const versionB = lookup.get(versionBId)
  if (!versionA || !versionB) {
    return {
      ok: false,
      issue: {
        code: 'UNKNOWN_VERSION',
        message: 'One or both versions were not found.',
      },
    }
  }
  if (versionA.noteId !== expectedNoteId || versionB.noteId !== expectedNoteId) {
    return {
      ok: false,
      issue: {
        code: 'NOTE_MISMATCH',
        message: 'Versions must belong to the same note.',
      },
    }
  }
  if (versionA.noteId !== versionB.noteId) {
    return {
      ok: false,
      issue: {
        code: 'NOTE_MISMATCH',
        message: 'Versions belong to different notes.',
      },
    }
  }

  const chainA = getAncestorChain(versionAId, lookup, expectedNoteId)
  if (!chainA.ok) {
    return chainA
  }

  const chainB = getAncestorChain(versionBId, lookup, expectedNoteId)
  if (!chainB.ok) {
    return chainB
  }

  for (const candidate of chainB.chain) {
    if (chainA.distanceById.has(candidate)) {
      return { ok: true, ancestorId: candidate }
    }
  }

  return { ok: false, code: 'NO_COMMON_ANCESTOR' }
}

export function validateVersionGraph(
  versions: readonly NoteVersion[],
): readonly VersionGraphIssue[] {
  const byId = new Map(versions.map((v) => [v.id, v]))
  const lookup: VersionLookup = {
    get: (id) => byId.get(id) ?? null,
  }
  const issues: VersionGraphIssue[] = []

  for (const version of versions) {
    const chain = getAncestorChain(version.id, lookup, version.noteId)
    if (!chain.ok) {
      issues.push(chain.issue)
    }
  }

  return issues
}

export function createVersionLookupFromList(versions: readonly NoteVersion[]): VersionLookup {
  const byId = new Map(versions.map((v) => [v.id, v]))
  return {
    get: (id) => byId.get(id) ?? null,
  }
}
