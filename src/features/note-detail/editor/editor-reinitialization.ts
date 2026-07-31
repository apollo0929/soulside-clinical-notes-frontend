import type { VersionId } from '@/domain/ids'

export const EDITOR_REINIT_DECISIONS = [
  'NO_CHANGE',
  'REINITIALIZE',
  'PRESERVE_DIRTY_AND_WARN',
] as const

export type EditorReinitializationDecision = (typeof EDITOR_REINIT_DECISIONS)[number]

export type EvaluateEditorReinitializationInput = {
  readonly editorBaseVersionId: VersionId
  readonly incomingVersionId: VersionId
  readonly isDirty: boolean
}

/**
 * Pure sync decision when detail query currentVersion changes while editing.
 *
 * - Same version id → NO_CHANGE
 * - Clean editor + new version → REINITIALIZE
 * - Dirty editor + new version → PRESERVE_DIRTY_AND_WARN (never overwrite draft)
 */
export function evaluateEditorReinitialization(
  input: EvaluateEditorReinitializationInput,
): EditorReinitializationDecision {
  if (input.editorBaseVersionId === input.incomingVersionId) {
    return 'NO_CHANGE'
  }
  if (input.isDirty) {
    return 'PRESERVE_DIRTY_AND_WARN'
  }
  return 'REINITIALIZE'
}
