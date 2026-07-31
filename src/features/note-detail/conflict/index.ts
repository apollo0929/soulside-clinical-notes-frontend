export { classifySectionConflict } from './classify-section-conflict'
export type {
  ConflictResolutionAction,
  ConflictResolutionSession,
  ConflictResolutionState,
  SectionConflictKind,
  SectionConflictState,
  SectionResolutionChoice,
  SectionResolutionState,
} from './conflict.types'
export {
  conflictResolutionReducer,
  createInitialConflictResolutionState,
} from './conflict-resolution.reducer'
export {
  buildResolvedSoapContent,
  describeAutomaticDecision,
  getUnresolvedConflictCount,
  isConflictSessionResolved,
  isSectionResolved,
  resolveSectionValue,
} from './conflict-selectors'
export { buildConflictResolutionSession, getDefaultSectionResolution } from './conflict-session'
export { ConflictDiff } from './ConflictDiff'
export { ConflictResolver } from './ConflictResolver'
export { ConflictSection } from './ConflictSection'
export { ConflictStatus } from './ConflictStatus'
export { useConflictHydration } from './use-conflict-hydration'
export {
  type ConflictLocalSnapshot,
  useConflictResolution,
  type UseConflictResolutionResult,
} from './use-conflict-resolution'
