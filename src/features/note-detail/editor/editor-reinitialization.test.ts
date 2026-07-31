import { describe, expect, it } from 'vitest'

import { parseVersionId } from '@/domain/ids'

import { evaluateEditorReinitialization } from './editor-reinitialization'

describe('evaluateEditorReinitialization', () => {
  const base = parseVersionId('ver_reinit_base')
  const newer = parseVersionId('ver_reinit_newer')

  it('37–41: pure decisions for same/new version and dirty flag', () => {
    expect(
      evaluateEditorReinitialization({
        editorBaseVersionId: base,
        incomingVersionId: base,
        isDirty: false,
      }),
    ).toBe('NO_CHANGE')
    expect(
      evaluateEditorReinitialization({
        editorBaseVersionId: base,
        incomingVersionId: base,
        isDirty: true,
      }),
    ).toBe('NO_CHANGE')
    expect(
      evaluateEditorReinitialization({
        editorBaseVersionId: base,
        incomingVersionId: newer,
        isDirty: false,
      }),
    ).toBe('REINITIALIZE')
    expect(
      evaluateEditorReinitialization({
        editorBaseVersionId: base,
        incomingVersionId: newer,
        isDirty: true,
      }),
    ).toBe('PRESERVE_DIRTY_AND_WARN')
    expect(typeof base).toBe('string')
    expect(base).not.toBe(newer)
  })
})
