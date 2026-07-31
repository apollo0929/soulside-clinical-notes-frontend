import type { NoteId, VersionId } from '@/domain/ids'
import { cloneSoapContent, SOAP_SECTION_KEYS, type SoapContent } from '@/domain/models/soap'

import { classifySectionConflict } from './classify-section-conflict'
import type {
  ConflictResolutionSession,
  SectionConflictKind,
  SectionConflictState,
  SectionResolutionState,
} from './conflict.types'

export function getDefaultSectionResolution(input: {
  readonly conflictKind: SectionConflictKind
  readonly ancestor: string
  readonly local: string
  readonly server: string
}): SectionResolutionState {
  switch (input.conflictKind) {
    case 'UNCHANGED':
      return {
        kind: 'AUTOMATIC',
        conflictKind: 'UNCHANGED',
        value: input.ancestor,
      }
    case 'LOCAL_ONLY':
      return {
        kind: 'AUTOMATIC',
        conflictKind: 'LOCAL_ONLY',
        value: input.local,
      }
    case 'SERVER_ONLY':
      return {
        kind: 'AUTOMATIC',
        conflictKind: 'SERVER_ONLY',
        value: input.server,
      }
    case 'SAME_CHANGE':
      return {
        kind: 'AUTOMATIC',
        conflictKind: 'SAME_CHANGE',
        value: input.local,
      }
    case 'CONFLICT':
      return { kind: 'UNRESOLVED' }
    default: {
      const _exhaustive: never = input.conflictKind
      return _exhaustive
    }
  }
}

export function buildSectionConflictState(input: {
  readonly section: SectionConflictState['section']
  readonly ancestor: string
  readonly local: string
  readonly server: string
}): SectionConflictState {
  const conflictKind = classifySectionConflict({
    ancestor: input.ancestor,
    local: input.local,
    server: input.server,
  })
  return Object.freeze({
    section: input.section,
    conflictKind,
    ancestor: input.ancestor,
    local: input.local,
    server: input.server,
    resolution: getDefaultSectionResolution({
      conflictKind,
      ancestor: input.ancestor,
      local: input.local,
      server: input.server,
    }),
  })
}

export type BuildConflictResolutionSessionInput = {
  readonly noteId: NoteId
  readonly localBaseVersionId: VersionId
  readonly serverHeadVersionId: VersionId
  readonly serverHeadRevision: number
  readonly commonAncestorVersionId: VersionId
  readonly commonAncestorRevision: number
  readonly ancestorContent: SoapContent
  readonly localContent: SoapContent
  readonly serverContent: SoapContent
}

/**
 * Builds an immutable conflict session from hydrated version content.
 * Clones all SOAP content so callers cannot mutate the session by reference.
 */
export function buildConflictResolutionSession(
  input: BuildConflictResolutionSessionInput,
): ConflictResolutionSession {
  const ancestorContent = cloneSoapContent(input.ancestorContent)
  const localContent = cloneSoapContent(input.localContent)
  const serverContent = cloneSoapContent(input.serverContent)

  const sections = Object.freeze(
    Object.fromEntries(
      SOAP_SECTION_KEYS.map((section) => [
        section,
        buildSectionConflictState({
          section,
          ancestor: ancestorContent[section],
          local: localContent[section],
          server: serverContent[section],
        }),
      ]),
    ) as Record<(typeof SOAP_SECTION_KEYS)[number], SectionConflictState>,
  )

  return Object.freeze({
    noteId: input.noteId,
    localBaseVersionId: input.localBaseVersionId,
    serverHeadVersionId: input.serverHeadVersionId,
    serverHeadRevision: input.serverHeadRevision,
    commonAncestorVersionId: input.commonAncestorVersionId,
    commonAncestorRevision: input.commonAncestorRevision,
    ancestorContent,
    localContent,
    serverContent,
    sections,
  })
}

export function initialResolutionMap(
  session: ConflictResolutionSession,
): Readonly<Record<(typeof SOAP_SECTION_KEYS)[number], SectionResolutionState>> {
  return Object.freeze(
    Object.fromEntries(
      SOAP_SECTION_KEYS.map((section) => [section, session.sections[section].resolution]),
    ) as Record<(typeof SOAP_SECTION_KEYS)[number], SectionResolutionState>,
  )
}
