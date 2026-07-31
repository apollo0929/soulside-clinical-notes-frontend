export {
  AUTOSAVE_DEBOUNCE_MS,
  type AutosaveStatus,
  type SaveIntent,
  type SaveSuccessEvent,
} from './autosave.types'
export { AutosaveCoordinator, createAutosaveCoordinator } from './autosave-coordinator'
export {
  autosaveNeedsNavigationGuard,
  autosaveStatusAriaLive,
  autosaveStatusLabel,
} from './autosave-status'
export { AutosaveStatusBanner } from './AutosaveStatus'
export { applySuccessfulVersionToDetail, reconcileDetailCacheAfterSave } from './note-detail-cache'
export { useNoteAutosave } from './use-note-autosave'
