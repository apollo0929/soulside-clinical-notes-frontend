import type { AutosaveStatus } from './autosave.types'

export function autosaveStatusLabel(status: AutosaveStatus): string {
  switch (status.kind) {
    case 'CLEAN':
      return 'No local changes'
    case 'DEBOUNCING':
      return 'Waiting to save…'
    case 'SAVING':
      return 'Saving…'
    case 'QUEUED':
      return 'Saving latest changes after current request…'
    case 'SAVED':
      return 'Saved'
    case 'ERROR':
      return status.retryable ? `Save failed: ${status.message}` : `Save failed: ${status.message}`
    case 'CONFLICT':
      return 'Newer server version detected. Your local edits have been preserved.'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export function autosaveNeedsNavigationGuard(status: AutosaveStatus): boolean {
  switch (status.kind) {
    case 'CLEAN':
    case 'SAVED':
      return false
    case 'DEBOUNCING':
    case 'SAVING':
    case 'QUEUED':
    case 'ERROR':
    case 'CONFLICT':
      return true
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

/** Whether the live region should announce this status (terminal / actionable only). */
export function autosaveStatusAriaLive(status: AutosaveStatus): 'polite' | 'off' {
  switch (status.kind) {
    case 'SAVED':
    case 'ERROR':
    case 'CONFLICT':
      return 'polite'
    case 'CLEAN':
    case 'DEBOUNCING':
    case 'SAVING':
    case 'QUEUED':
      return 'off'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}
