import { cloneSoapContent, SOAP_SECTION_KEYS, type SoapContent } from '@/domain/models/soap'

import type {
  ConflictResolutionSession,
  ConflictResolutionState,
  SectionResolutionState,
} from './conflict.types'

export function isSectionResolved(resolution: SectionResolutionState): boolean {
  return resolution.kind === 'AUTOMATIC' || resolution.kind === 'EXPLICIT'
}

export function resolveSectionValue(resolution: SectionResolutionState): string | null {
  if (resolution.kind === 'UNRESOLVED') {
    return null
  }
  return resolution.value
}

export function getUnresolvedConflictSections(
  state: ConflictResolutionState,
): readonly (typeof SOAP_SECTION_KEYS)[number][] {
  return SOAP_SECTION_KEYS.filter((section) => {
    const meta = state.session.sections[section]
    if (meta.conflictKind !== 'CONFLICT') {
      return false
    }
    return !isSectionResolved(state.sections[section])
  })
}

export function getUnresolvedConflictCount(state: ConflictResolutionState): number {
  return getUnresolvedConflictSections(state).length
}

export function isConflictSessionResolved(state: ConflictResolutionState): boolean {
  return getUnresolvedConflictCount(state) === 0
}

/**
 * Builds submit-ready SOAP content. Returns null while any true conflict is unresolved.
 * Output is a frozen clone.
 */
export function buildResolvedSoapContent(state: ConflictResolutionState): SoapContent | null {
  if (!isConflictSessionResolved(state)) {
    return null
  }
  const content = {
    subjective: resolveSectionValue(state.sections.subjective)!,
    objective: resolveSectionValue(state.sections.objective)!,
    assessment: resolveSectionValue(state.sections.assessment)!,
    plan: resolveSectionValue(state.sections.plan)!,
  }
  return cloneSoapContent(content)
}

export function describeAutomaticDecision(
  session: ConflictResolutionSession,
  section: (typeof SOAP_SECTION_KEYS)[number],
): string {
  const meta = session.sections[section]
  switch (meta.conflictKind) {
    case 'UNCHANGED':
      return 'Unchanged — kept shared value'
    case 'LOCAL_ONLY':
      return 'Automatic — kept your local edit'
    case 'SERVER_ONLY':
      return 'Automatic — accepted server change'
    case 'SAME_CHANGE':
      return 'Automatic — local and server made the same change'
    case 'CONFLICT':
      return 'Needs your choice'
    default: {
      const _exhaustive: never = meta.conflictKind
      return _exhaustive
    }
  }
}
