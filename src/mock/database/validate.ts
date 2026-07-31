import type { NoteId, VersionId } from '@/domain/ids'
import type { NoteVersion } from '@/domain/models/note-version'
import type { MockDatabase } from '@/mock/database/repository'

export type IntegrityIssue = {
  readonly code: string
  readonly message: string
}

/**
 * Validates seeded / mutated mock database invariants.
 */
export function validateMockDatabaseIntegrity(db: MockDatabase): readonly IntegrityIssue[] {
  const issues: IntegrityIssue[] = []
  const notes = db.listNotes()
  const patients = new Set(db.listPatients().map((p) => p.id))
  const usersById = new Map(db.listUsers().map((u) => [u.id, u]))
  const versionsById = new Map<VersionId, NoteVersion>()

  for (const note of notes) {
    for (const version of db.listVersionsForNote(note.id)) {
      versionsById.set(version.id, version)
    }
  }

  for (const note of notes) {
    if (!patients.has(note.patientId)) {
      issues.push({
        code: 'MISSING_PATIENT',
        message: `Note ${note.id} references missing patient ${note.patientId}`,
      })
    }

    const current = versionsById.get(note.currentVersionId)
    if (!current) {
      issues.push({
        code: 'MISSING_CURRENT_VERSION',
        message: `Note ${note.id} currentVersionId ${note.currentVersionId} does not exist`,
      })
    } else if (current.noteId !== note.id) {
      issues.push({
        code: 'CURRENT_VERSION_NOTE_MISMATCH',
        message: `Note ${note.id} current version belongs to ${current.noteId}`,
      })
    }

    if (note.assignedReviewerId !== null) {
      const reviewer = usersById.get(note.assignedReviewerId)
      if (!reviewer) {
        issues.push({
          code: 'MISSING_REVIEWER',
          message: `Note ${note.id} assignedReviewerId ${note.assignedReviewerId} missing`,
        })
      } else if (reviewer.role !== 'REVIEWER') {
        issues.push({
          code: 'ASSIGNED_NOT_REVIEWER',
          message: `Note ${note.id} assigned user is not REVIEWER`,
        })
      }
    }

    if (note.status === 'IN_REVIEW' && note.assignedReviewerId === null) {
      issues.push({
        code: 'IN_REVIEW_WITHOUT_REVIEWER',
        message: `IN_REVIEW note ${note.id} has no assignedReviewerId`,
      })
    }

    if (
      note.status !== 'IN_REVIEW' &&
      note.assignedReviewerId !== null &&
      note.status !== 'APPROVED' &&
      note.status !== 'REJECTED'
    ) {
      // APPROVED/REJECTED may briefly retain history; we clear on release effects.
      // For seed: non-IN_REVIEW should normally be null except we allow null only.
      // Spec: statuses that do not require active reviewer should normally have null.
      if (
        note.status === 'GENERATING' ||
        note.status === 'FAILED' ||
        note.status === 'READY_FOR_REVIEW' ||
        note.status === 'AMENDED' ||
        note.status === 'LOCKED'
      ) {
        issues.push({
          code: 'UNEXPECTED_REVIEWER_ASSIGNMENT',
          message: `Note ${note.id} status ${note.status} should not have assignedReviewerId`,
        })
      }
    }

    const versions = db.listVersionsForNote(note.id)
    const revisions = new Set<number>()
    for (const version of versions) {
      if (version.revisionNumber < 1 || !Number.isInteger(version.revisionNumber)) {
        issues.push({
          code: 'INVALID_REVISION',
          message: `Version ${version.id} has invalid revision ${version.revisionNumber}`,
        })
      }
      if (revisions.has(version.revisionNumber)) {
        issues.push({
          code: 'DUPLICATE_REVISION',
          message: `Note ${note.id} has duplicate revision ${version.revisionNumber}`,
        })
      }
      revisions.add(version.revisionNumber)

      if (version.parentVersionId !== null) {
        const parent = versionsById.get(version.parentVersionId)
        if (!parent) {
          issues.push({
            code: 'MISSING_PARENT_VERSION',
            message: `Version ${version.id} parent ${version.parentVersionId} missing`,
          })
        } else if (parent.noteId !== note.id) {
          issues.push({
            code: 'PARENT_NOTE_MISMATCH',
            message: `Version ${version.id} parent belongs to another note`,
          })
        }
      }
    }

    const cycle = findVersionCycle(versions)
    if (cycle) {
      issues.push({
        code: 'VERSION_CYCLE',
        message: `Note ${note.id} has a version parent cycle involving ${cycle}`,
      })
    }

    for (const event of db.listReviewEvents(note.id)) {
      if (event.noteId !== note.id) {
        issues.push({
          code: 'REVIEW_EVENT_NOTE_MISMATCH',
          message: `Review event ${event.id} note mismatch`,
        })
      }
      const eventVersion = versionsById.get(event.versionId)
      if (!eventVersion || eventVersion.noteId !== note.id) {
        issues.push({
          code: 'REVIEW_EVENT_VERSION_INVALID',
          message: `Review event ${event.id} version invalid for note ${note.id}`,
        })
      }
    }
  }

  // Orphan review events are stored by note id key — already covered via note iteration.
  return issues
}

export function assertMockDatabaseIntegrity(db: MockDatabase): void {
  const issues = validateMockDatabaseIntegrity(db)
  if (issues.length > 0) {
    const summary = issues.map((i) => `${i.code}: ${i.message}`).join('\n')
    throw new Error(`Mock database integrity failed:\n${summary}`)
  }
}

function findVersionCycle(versions: readonly NoteVersion[]): VersionId | null {
  const byId = new Map(versions.map((v) => [v.id, v]))
  const visiting = new Set<VersionId>()
  const visited = new Set<VersionId>()

  const dfs = (id: VersionId): VersionId | null => {
    if (visiting.has(id)) {
      return id
    }
    if (visited.has(id)) {
      return null
    }
    visiting.add(id)
    const version = byId.get(id)
    if (version?.parentVersionId) {
      const cycle = dfs(version.parentVersionId)
      if (cycle) {
        return cycle
      }
    }
    visiting.delete(id)
    visited.add(id)
    return null
  }

  for (const version of versions) {
    const cycle = dfs(version.id)
    if (cycle) {
      return cycle
    }
  }
  return null
}

export type { NoteId }
