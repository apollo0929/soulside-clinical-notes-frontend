import { SOAP_SECTION_KEYS } from '@/domain/models/soap'

import type {
  ConflictResolutionAction,
  ConflictResolutionSession,
  ConflictResolutionState,
  SectionResolutionState,
} from './conflict.types'
import { getDefaultSectionResolution } from './conflict-session'

function cloneResolutions(
  sections: ConflictResolutionState['sections'],
): Record<(typeof SOAP_SECTION_KEYS)[number], SectionResolutionState> {
  return Object.fromEntries(
    SOAP_SECTION_KEYS.map((section) => [section, sections[section]]),
  ) as Record<(typeof SOAP_SECTION_KEYS)[number], SectionResolutionState>
}

function requireConflictSection(
  session: ConflictResolutionSession,
  section: (typeof SOAP_SECTION_KEYS)[number],
) {
  const meta = session.sections[section]
  if (meta.conflictKind !== 'CONFLICT') {
    return null
  }
  return meta
}

/**
 * Pure reducer for explicit conflict-section choices.
 * Automatic sections are never changed by choose actions.
 */
export function createInitialConflictResolutionState(
  session: ConflictResolutionSession,
): ConflictResolutionState {
  return Object.freeze({
    session,
    sections: Object.freeze(
      Object.fromEntries(
        SOAP_SECTION_KEYS.map((section) => [section, session.sections[section].resolution]),
      ) as ConflictResolutionState['sections'],
    ),
  })
}

export function conflictResolutionReducer(
  state: ConflictResolutionState,
  action: ConflictResolutionAction,
): ConflictResolutionState {
  switch (action.type) {
    case 'CHOOSE_LOCAL': {
      const meta = requireConflictSection(state.session, action.section)
      if (!meta) {
        return state
      }
      const next = cloneResolutions(state.sections)
      next[action.section] = Object.freeze({
        kind: 'EXPLICIT',
        choice: 'KEEP_LOCAL',
        value: meta.local,
      })
      return Object.freeze({
        session: state.session,
        sections: Object.freeze(next),
      })
    }
    case 'CHOOSE_SERVER': {
      const meta = requireConflictSection(state.session, action.section)
      if (!meta) {
        return state
      }
      const next = cloneResolutions(state.sections)
      next[action.section] = Object.freeze({
        kind: 'EXPLICIT',
        choice: 'USE_SERVER',
        value: meta.server,
      })
      return Object.freeze({
        session: state.session,
        sections: Object.freeze(next),
      })
    }
    case 'CHOOSE_MANUAL': {
      const meta = requireConflictSection(state.session, action.section)
      if (!meta) {
        return state
      }
      const current = state.sections[action.section]
      // Preferred manual initialization: local content (or keep existing manual text).
      const initialValue =
        current.kind === 'EXPLICIT' && current.choice === 'MANUAL' ? current.value : meta.local
      const next = cloneResolutions(state.sections)
      next[action.section] = Object.freeze({
        kind: 'EXPLICIT',
        choice: 'MANUAL',
        value: initialValue,
      })
      return Object.freeze({
        session: state.session,
        sections: Object.freeze(next),
      })
    }
    case 'UPDATE_MANUAL_VALUE': {
      const meta = requireConflictSection(state.session, action.section)
      if (!meta) {
        return state
      }
      const current = state.sections[action.section]
      if (current.kind !== 'EXPLICIT' || current.choice !== 'MANUAL') {
        return state
      }
      if (current.value === action.value) {
        return state
      }
      const next = cloneResolutions(state.sections)
      next[action.section] = Object.freeze({
        kind: 'EXPLICIT',
        choice: 'MANUAL',
        value: action.value,
      })
      return Object.freeze({
        session: state.session,
        sections: Object.freeze(next),
      })
    }
    case 'RESET_SECTION': {
      const meta = state.session.sections[action.section]
      if (meta.conflictKind !== 'CONFLICT') {
        return state
      }
      const next = cloneResolutions(state.sections)
      next[action.section] = getDefaultSectionResolution({
        conflictKind: meta.conflictKind,
        ancestor: meta.ancestor,
        local: meta.local,
        server: meta.server,
      })
      return Object.freeze({
        session: state.session,
        sections: Object.freeze(next),
      })
    }
    case 'RESET_ALL': {
      const next = Object.fromEntries(
        SOAP_SECTION_KEYS.map((section) => {
          const meta = state.session.sections[section]
          return [
            section,
            getDefaultSectionResolution({
              conflictKind: meta.conflictKind,
              ancestor: meta.ancestor,
              local: meta.local,
              server: meta.server,
            }),
          ]
        }),
      ) as ConflictResolutionState['sections']
      return Object.freeze({
        session: state.session,
        sections: Object.freeze(next),
      })
    }
    default: {
      const _exhaustive: never = action
      return _exhaustive
    }
  }
}
