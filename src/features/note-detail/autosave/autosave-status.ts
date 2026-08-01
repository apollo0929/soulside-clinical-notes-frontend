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
    case 'QUEUED_OFFLINE':
      return 'Saved on this device — waiting to sync…'
    case 'REPLAYING':
      return 'Syncing queued changes…'
    case 'SYNC_FAILED':
      return `Could not sync: ${status.message}`
    case 'BLOCKED_CONFLICT':
      return 'Queued change needs conflict resolution before sync can continue.'
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
    case 'QUEUED_OFFLINE':
    case 'REPLAYING':
    case 'SYNC_FAILED':
      // Locally durable IndexedDB queue — reload-safe; banner covers sync status.
      return false
    case 'DEBOUNCING':
    case 'SAVING':
    case 'QUEUED':
    case 'ERROR':
    case 'CONFLICT':
    case 'BLOCKED_CONFLICT':
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
    case 'QUEUED_OFFLINE':
    case 'SYNC_FAILED':
    case 'BLOCKED_CONFLICT':
      return 'polite'
    case 'CLEAN':
    case 'DEBOUNCING':
    case 'SAVING':
    case 'QUEUED':
    case 'REPLAYING':
      return 'off'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}
