import { describe, expect, it } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import { buildSoapContent } from '@/test/fixtures/domain'

import {
  conflictResolutionReducer,
  createInitialConflictResolutionState,
} from './conflict-resolution.reducer'
import {
  buildResolvedSoapContent,
  getUnresolvedConflictCount,
  isConflictSessionResolved,
} from './conflict-selectors'
import { buildConflictResolutionSession } from './conflict-session'

function buildState() {
  const session = buildConflictResolutionSession({
    noteId: parseNoteId('note_c1'),
    localBaseVersionId: parseVersionId('ver_5'),
    serverHeadVersionId: parseVersionId('ver_7'),
    serverHeadRevision: 7,
    commonAncestorVersionId: parseVersionId('ver_4'),
    commonAncestorRevision: 4,
    ancestorContent: buildSoapContent({
      subjective: 'aS',
      objective: 'aO',
      assessment: 'aA',
      plan: 'aP',
    }),
    localContent: buildSoapContent({
      subjective: 'lS',
      objective: 'lO',
      assessment: 'aA',
      plan: 'lP',
    }),
    serverContent: buildSoapContent({
      subjective: 'sS',
      objective: 'sO',
      assessment: 'aA',
      plan: 'aP',
    }),
  })
  return createInitialConflictResolutionState(session)
}

describe('conflictResolutionReducer and selectors', () => {
  it('17–26: choose local/server/manual, empty manual, reset; no mutation', () => {
    const state0 = buildState()
    expect(state0.sections.subjective.kind).toBe('UNRESOLVED')
    expect(state0.sections.objective.kind).toBe('UNRESOLVED')

    const local = conflictResolutionReducer(state0, {
      type: 'CHOOSE_LOCAL',
      section: 'subjective',
    })
    expect(local.sections.subjective).toEqual({
      kind: 'EXPLICIT',
      choice: 'KEEP_LOCAL',
      value: 'lS',
    })
    expect(state0.sections.subjective.kind).toBe('UNRESOLVED')

    const server = conflictResolutionReducer(local, {
      type: 'CHOOSE_SERVER',
      section: 'objective',
    })
    expect(server.sections.objective).toEqual({
      kind: 'EXPLICIT',
      choice: 'USE_SERVER',
      value: 'sO',
    })

    const manual = conflictResolutionReducer(server, {
      type: 'CHOOSE_MANUAL',
      section: 'subjective',
    })
    expect(manual.sections.subjective).toMatchObject({
      kind: 'EXPLICIT',
      choice: 'MANUAL',
      value: 'lS',
    })

    const empty = conflictResolutionReducer(manual, {
      type: 'UPDATE_MANUAL_VALUE',
      section: 'subjective',
      value: '',
    })
    expect(empty.sections.subjective).toEqual({
      kind: 'EXPLICIT',
      choice: 'MANUAL',
      value: '',
    })

    const reset = conflictResolutionReducer(empty, {
      type: 'RESET_SECTION',
      section: 'subjective',
    })
    expect(reset.sections.subjective.kind).toBe('UNRESOLVED')

    const resetAll = conflictResolutionReducer(server, { type: 'RESET_ALL' })
    expect(resetAll.sections.subjective.kind).toBe('UNRESOLVED')
    expect(resetAll.sections.objective.kind).toBe('UNRESOLVED')
    expect(state0.session.localContent.subjective).toBe('lS')
  })

  it('27–36: unresolved count and resolved content assembly', () => {
    let state = buildState()
    expect(getUnresolvedConflictCount(state)).toBe(2)
    expect(isConflictSessionResolved(state)).toBe(false)
    expect(buildResolvedSoapContent(state)).toBeNull()

    state = conflictResolutionReducer(state, { type: 'CHOOSE_LOCAL', section: 'subjective' })
    state = conflictResolutionReducer(state, { type: 'CHOOSE_SERVER', section: 'objective' })
    expect(getUnresolvedConflictCount(state)).toBe(0)
    expect(isConflictSessionResolved(state)).toBe(true)

    const content = buildResolvedSoapContent(state)
    expect(content).toEqual({
      subjective: 'lS',
      objective: 'sO',
      assessment: 'aA',
      plan: 'lP',
    })
    expect(Object.isFrozen(content)).toBe(true)
  })
})
