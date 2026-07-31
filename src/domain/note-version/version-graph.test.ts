import { describe, expect, it } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parseVersionId } from '@/domain/ids'
import { parseUserId } from '@/domain/ids'
import type { NoteVersion } from '@/domain/models/note-version'
import {
  createVersionLookupFromList,
  findNearestCommonAncestor,
  getAncestorChain,
  validateVersionGraph,
} from '@/domain/note-version'

function version(input: {
  id: string
  noteId: string
  revision: number
  parent: string | null
}): NoteVersion {
  return Object.freeze({
    id: parseVersionId(input.id),
    noteId: parseNoteId(input.noteId),
    revisionNumber: input.revision,
    parentVersionId: input.parent ? parseVersionId(input.parent) : null,
    content: Object.freeze({
      subjective: 's',
      objective: 'o',
      assessment: 'a',
      plan: 'p',
    }),
    authorId: parseUserId('usr_a'),
    authorRole: 'CLINICIAN',
    createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
  })
}

describe('version graph', () => {
  it('1: linear ancestor lookup returns nearest common ancestor', () => {
    const versions = [
      version({ id: 'ver_1', noteId: 'note_1', revision: 1, parent: null }),
      version({ id: 'ver_2', noteId: 'note_1', revision: 2, parent: 'ver_1' }),
      version({ id: 'ver_3', noteId: 'note_1', revision: 3, parent: 'ver_2' }),
    ]
    const lookup = createVersionLookupFromList(versions)
    const result = findNearestCommonAncestor(
      parseVersionId('ver_2'),
      parseVersionId('ver_3'),
      lookup,
      parseNoteId('note_1'),
    )
    expect(result).toEqual({ ok: true, ancestorId: parseVersionId('ver_2') })
  })

  it('2: branched histories return branch point', () => {
    const versions = [
      version({ id: 'ver_1', noteId: 'note_1', revision: 1, parent: null }),
      version({ id: 'ver_2', noteId: 'note_1', revision: 2, parent: 'ver_1' }),
      version({ id: 'ver_3a', noteId: 'note_1', revision: 3, parent: 'ver_2' }),
      version({ id: 'ver_3b', noteId: 'note_1', revision: 4, parent: 'ver_2' }),
    ]
    const lookup = createVersionLookupFromList(versions)
    const result = findNearestCommonAncestor(
      parseVersionId('ver_3a'),
      parseVersionId('ver_3b'),
      lookup,
      parseNoteId('note_1'),
    )
    expect(result).toEqual({ ok: true, ancestorId: parseVersionId('ver_2') })
  })

  it('3: same version returns itself as common ancestor', () => {
    const versions = [version({ id: 'ver_1', noteId: 'note_1', revision: 1, parent: null })]
    const lookup = createVersionLookupFromList(versions)
    const result = findNearestCommonAncestor(
      parseVersionId('ver_1'),
      parseVersionId('ver_1'),
      lookup,
      parseNoteId('note_1'),
    )
    expect(result).toEqual({ ok: true, ancestorId: parseVersionId('ver_1') })
  })

  it('4: missing parent is rejected', () => {
    const versions = [
      version({ id: 'ver_2', noteId: 'note_1', revision: 2, parent: 'ver_missing' }),
    ]
    const chain = getAncestorChain(
      parseVersionId('ver_2'),
      createVersionLookupFromList(versions),
      parseNoteId('note_1'),
    )
    expect(chain.ok).toBe(false)
    if (!chain.ok) {
      expect(chain.issue.code).toBe('MISSING_PARENT')
    }
  })

  it('5: cycle is detected', () => {
    const a = version({ id: 'ver_a', noteId: 'note_1', revision: 1, parent: 'ver_b' })
    const b = version({ id: 'ver_b', noteId: 'note_1', revision: 2, parent: 'ver_a' })
    const issues = validateVersionGraph([a, b])
    expect(issues.some((issue) => issue.code === 'CYCLE')).toBe(true)
  })

  it('6: versions from different notes are rejected', () => {
    const versions = [
      version({ id: 'ver_1', noteId: 'note_1', revision: 1, parent: null }),
      version({ id: 'ver_2', noteId: 'note_2', revision: 1, parent: null }),
    ]
    const result = findNearestCommonAncestor(
      parseVersionId('ver_1'),
      parseVersionId('ver_2'),
      createVersionLookupFromList(versions),
      parseNoteId('note_1'),
    )
    expect(result.ok).toBe(false)
    if (!result.ok && 'issue' in result) {
      expect(result.issue.code).toBe('NOTE_MISMATCH')
    }
  })

  it('7: no common ancestor is treated as invalid graph outcome', () => {
    const versions = [
      version({ id: 'ver_a', noteId: 'note_1', revision: 1, parent: null }),
      version({ id: 'ver_b', noteId: 'note_1', revision: 2, parent: null }),
    ]
    const result = findNearestCommonAncestor(
      parseVersionId('ver_a'),
      parseVersionId('ver_b'),
      createVersionLookupFromList(versions),
      parseNoteId('note_1'),
    )
    expect(result).toEqual({ ok: false, code: 'NO_COMMON_ANCESTOR' })
  })
})
