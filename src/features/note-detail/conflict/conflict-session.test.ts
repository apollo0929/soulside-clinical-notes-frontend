import { describe, expect, it } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import { buildSoapContent } from '@/test/fixtures/domain'

import { buildConflictResolutionSession, getDefaultSectionResolution } from './conflict-session'

describe('conflict-session defaults', () => {
  it('10–16: automatic resolutions and immutable session', () => {
    expect(
      getDefaultSectionResolution({
        conflictKind: 'UNCHANGED',
        ancestor: 'a',
        local: 'a',
        server: 'a',
      }),
    ).toEqual({ kind: 'AUTOMATIC', conflictKind: 'UNCHANGED', value: 'a' })
    expect(
      getDefaultSectionResolution({
        conflictKind: 'LOCAL_ONLY',
        ancestor: 'a',
        local: 'L',
        server: 'a',
      }),
    ).toEqual({ kind: 'AUTOMATIC', conflictKind: 'LOCAL_ONLY', value: 'L' })
    expect(
      getDefaultSectionResolution({
        conflictKind: 'SERVER_ONLY',
        ancestor: 'a',
        local: 'a',
        server: 'S',
      }),
    ).toEqual({ kind: 'AUTOMATIC', conflictKind: 'SERVER_ONLY', value: 'S' })
    expect(
      getDefaultSectionResolution({
        conflictKind: 'SAME_CHANGE',
        ancestor: 'a',
        local: 'X',
        server: 'X',
      }),
    ).toEqual({ kind: 'AUTOMATIC', conflictKind: 'SAME_CHANGE', value: 'X' })
    expect(
      getDefaultSectionResolution({
        conflictKind: 'CONFLICT',
        ancestor: 'a',
        local: 'L',
        server: 'S',
      }),
    ).toEqual({ kind: 'UNRESOLVED' })

    const ancestor = buildSoapContent({
      subjective: 'aS',
      objective: 'aO',
      assessment: 'aA',
      plan: 'aP',
    })
    const local = buildSoapContent({
      subjective: 'lS',
      objective: 'aO',
      assessment: 'aA',
      plan: 'lP',
    })
    const server = buildSoapContent({
      subjective: 'sS',
      objective: 'sO',
      assessment: 'aA',
      plan: 'aP',
    })
    const session = buildConflictResolutionSession({
      noteId: parseNoteId('note_c1'),
      localBaseVersionId: parseVersionId('ver_5'),
      serverHeadVersionId: parseVersionId('ver_7'),
      serverHeadRevision: 7,
      commonAncestorVersionId: parseVersionId('ver_4'),
      commonAncestorRevision: 4,
      ancestorContent: ancestor,
      localContent: local,
      serverContent: server,
    })
    expect(session.sections.subjective.conflictKind).toBe('CONFLICT')
    expect(session.sections.objective.conflictKind).toBe('SERVER_ONLY')
    expect(session.sections.assessment.conflictKind).toBe('UNCHANGED')
    expect(session.sections.plan.conflictKind).toBe('LOCAL_ONLY')
    expect(session.ancestorContent).not.toBe(ancestor)
    expect(Object.isFrozen(session)).toBe(true)
  })
})
