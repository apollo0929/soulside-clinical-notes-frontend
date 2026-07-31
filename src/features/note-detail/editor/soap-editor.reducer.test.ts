import { describe, expect, it } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import { buildSoapContent } from '@/test/fixtures/domain'

import { createInitialSoapEditorState, soapEditorReducer } from './soap-editor.reducer'

const noteId = parseNoteId('note_editor_1')
const versionA = parseVersionId('ver_editor_a')
const versionB = parseVersionId('ver_editor_b')

function init(overrides?: {
  subjective?: string
  objective?: string
  assessment?: string
  plan?: string
}) {
  return createInitialSoapEditorState({
    noteId,
    baseVersionId: versionA,
    content: buildSoapContent(overrides),
  })
}

describe('soapEditorReducer', () => {
  it('1–2: initialize creates clean state without shared mutable refs', () => {
    const source = {
      subjective: 'S1',
      objective: 'O1',
      assessment: 'A1',
      plan: 'P1',
    }
    const state = createInitialSoapEditorState({
      noteId,
      baseVersionId: versionA,
      content: source,
    })
    expect(state.dirtySections.size).toBe(0)
    expect(state.draftContent).toEqual(state.initialContent)
    expect(state.draftContent).not.toBe(state.initialContent)
    expect(state.initialContent).not.toBe(source)
    source.subjective = 'mutated'
    expect(state.initialContent.subjective).toBe('S1')
    expect(state.draftContent.subjective).toBe('S1')
  })

  it('3–5: updates track independent dirty sections', () => {
    const state0 = init()
    const state1 = soapEditorReducer(state0, {
      type: 'UPDATE_SECTION',
      section: 'subjective',
      value: 'Changed S',
    })
    expect(state1.draftContent.subjective).toBe('Changed S')
    expect(state1.draftContent.objective).toBe(state0.draftContent.objective)
    expect([...state1.dirtySections]).toEqual(['subjective'])

    const state2 = soapEditorReducer(state1, {
      type: 'UPDATE_SECTION',
      section: 'objective',
      value: 'Changed O',
    })
    expect(state2.dirtySections.has('subjective')).toBe(true)
    expect(state2.dirtySections.has('objective')).toBe(true)
    expect(state2.dirtySections.size).toBe(2)
  })

  it('6–7: exact revert clears dirty; whitespace remains dirty', () => {
    const state0 = init({ subjective: 'Exact' })
    const dirty = soapEditorReducer(state0, {
      type: 'UPDATE_SECTION',
      section: 'subjective',
      value: 'Exact ',
    })
    expect(dirty.dirtySections.has('subjective')).toBe(true)

    const reverted = soapEditorReducer(dirty, {
      type: 'UPDATE_SECTION',
      section: 'subjective',
      value: 'Exact',
    })
    expect(reverted.dirtySections.has('subjective')).toBe(false)
    expect(reverted.dirtySections.size).toBe(0)
  })

  it('8–10: reset section and reset all', () => {
    let state = init()
    state = soapEditorReducer(state, {
      type: 'UPDATE_SECTION',
      section: 'subjective',
      value: 'S*',
    })
    state = soapEditorReducer(state, {
      type: 'UPDATE_SECTION',
      section: 'plan',
      value: 'P*',
    })
    const afterSection = soapEditorReducer(state, {
      type: 'RESET_SECTION',
      section: 'subjective',
    })
    expect(afterSection.draftContent.subjective).toBe(state.initialContent.subjective)
    expect(afterSection.draftContent.plan).toBe('P*')
    expect(afterSection.dirtySections.has('subjective')).toBe(false)
    expect(afterSection.dirtySections.has('plan')).toBe(true)

    const afterAll = soapEditorReducer(afterSection, { type: 'RESET_ALL' })
    expect(afterAll.draftContent).toEqual(afterAll.initialContent)
    expect(afterAll.dirtySections.size).toBe(0)
  })

  it('11–14: no-op returns same state; prior state and sets are not mutated', () => {
    const state0 = init()
    const dirtyBefore = state0.dirtySections
    const same = soapEditorReducer(state0, {
      type: 'UPDATE_SECTION',
      section: 'subjective',
      value: state0.draftContent.subjective,
    })
    expect(same).toBe(state0)

    const action = {
      type: 'UPDATE_SECTION' as const,
      section: 'assessment' as const,
      value: 'New A',
    }
    const next = soapEditorReducer(state0, action)
    expect(state0.draftContent.assessment).not.toBe('New A')
    expect(dirtyBefore.size).toBe(0)
    expect(state0.dirtySections.size).toBe(0)
    expect(next.dirtySections).not.toBe(state0.dirtySections)
    ;(action as { value: string }).value = 'mutated-action'
    expect(next.draftContent.assessment).toBe('New A')
  })

  it('15–18: ACCEPT_SAVED_VERSION updates base and clears dirty deterministically', () => {
    let state = init({ subjective: 'Old' })
    state = soapEditorReducer(state, {
      type: 'UPDATE_SECTION',
      section: 'subjective',
      value: 'Draft',
    })
    const saved = buildSoapContent({ subjective: 'Saved' })
    const accepted = soapEditorReducer(state, {
      type: 'ACCEPT_SAVED_VERSION',
      baseVersionId: versionB,
      content: saved,
    })
    expect(accepted.baseVersionId).toBe(versionB)
    expect(accepted.initialContent.subjective).toBe('Saved')
    expect(accepted.draftContent.subjective).toBe('Saved')
    expect(accepted.dirtySections.size).toBe(0)
    expect(accepted.initialContent).not.toBe(saved)
    expect(accepted.draftContent).not.toBe(accepted.initialContent)

    const again = soapEditorReducer(accepted, {
      type: 'ACCEPT_SAVED_VERSION',
      baseVersionId: versionB,
      content: saved,
    })
    expect(again.baseVersionId).toBe(versionB)
    expect(again.dirtySections.size).toBe(0)
  })
})
