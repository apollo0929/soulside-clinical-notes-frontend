import type { ClientMutationId, NoteId, PatientId, UserId, VersionId } from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import type { Patient } from '@/domain/models/patient'
import type { ReviewEvent } from '@/domain/models/review-event'
import type { SoapContent } from '@/domain/models/soap'
import type { User } from '@/domain/models/user'
import { createMockApiError, type MockApiError } from '@/mock/errors'

function freezeSoap(content: SoapContent): SoapContent {
  return Object.freeze({
    subjective: content.subjective,
    objective: content.objective,
    assessment: content.assessment,
    plan: content.plan,
  })
}

function cloneSoap(content: SoapContent): SoapContent {
  return freezeSoap({
    subjective: content.subjective,
    objective: content.objective,
    assessment: content.assessment,
    plan: content.plan,
  })
}

function cloneUser(user: User): User {
  return Object.freeze({ ...user })
}

function clonePatient(patient: Patient): Patient {
  return Object.freeze({ ...patient })
}

function cloneNote(note: Note): Note {
  return Object.freeze({ ...note })
}

function cloneVersion(version: NoteVersion): NoteVersion {
  return Object.freeze({
    ...version,
    content: cloneSoap(version.content),
  })
}

function cloneReviewEvent(event: ReviewEvent): ReviewEvent {
  return Object.freeze({ ...event })
}

export type MockDatabaseSnapshot = {
  readonly users: readonly User[]
  readonly patients: readonly Patient[]
  readonly notes: readonly Note[]
  readonly versions: readonly NoteVersion[]
  readonly reviewEvents: readonly ReviewEvent[]
  readonly completedMutationIds: readonly ClientMutationId[]
}

/**
 * Normalized in-memory mock database with repository methods.
 * Internal Maps are never exposed; returned entities are frozen clones.
 */
export class MockDatabase {
  private readonly usersById = new Map<UserId, User>()
  private readonly patientsById = new Map<PatientId, Patient>()
  private readonly notesById = new Map<NoteId, Note>()
  private readonly versionsById = new Map<VersionId, NoteVersion>()
  private readonly versionIdsByNoteId = new Map<NoteId, VersionId[]>()
  private readonly reviewEventsByNoteId = new Map<NoteId, ReviewEvent[]>()
  private readonly reviewEventsById = new Map<string, ReviewEvent>()
  private readonly completedMutations = new Map<ClientMutationId, unknown>()

  reset(): void {
    this.usersById.clear()
    this.patientsById.clear()
    this.notesById.clear()
    this.versionsById.clear()
    this.versionIdsByNoteId.clear()
    this.reviewEventsByNoteId.clear()
    this.reviewEventsById.clear()
    this.completedMutations.clear()
  }

  replaceAll(snapshot: MockDatabaseSnapshot): void {
    this.reset()
    for (const user of snapshot.users) {
      this.saveUser(user)
    }
    for (const patient of snapshot.patients) {
      this.savePatient(patient)
    }
    for (const version of snapshot.versions) {
      this.appendVersion(version)
    }
    for (const note of snapshot.notes) {
      this.saveNote(note)
    }
    for (const event of snapshot.reviewEvents) {
      this.appendReviewEvent(event)
    }
    for (const mutationId of snapshot.completedMutationIds) {
      this.saveCompletedMutation(mutationId, { ok: true })
    }
  }

  getUser(id: UserId): User | null {
    const user = this.usersById.get(id)
    return user ? cloneUser(user) : null
  }

  listUsers(): readonly User[] {
    return [...this.usersById.values()].map(cloneUser)
  }

  saveUser(user: User): void {
    if (this.usersById.has(user.id)) {
      throw duplicateError('User', user.id)
    }
    this.usersById.set(user.id, cloneUser(user))
  }

  getPatient(id: PatientId): Patient | null {
    const patient = this.patientsById.get(id)
    return patient ? clonePatient(patient) : null
  }

  listPatients(): readonly Patient[] {
    return [...this.patientsById.values()].map(clonePatient)
  }

  savePatient(patient: Patient): void {
    if (this.patientsById.has(patient.id)) {
      throw duplicateError('Patient', patient.id)
    }
    this.patientsById.set(patient.id, clonePatient(patient))
  }

  getNote(id: NoteId): Note | null {
    const note = this.notesById.get(id)
    return note ? cloneNote(note) : null
  }

  listNotes(): readonly Note[] {
    return [...this.notesById.values()].map(cloneNote)
  }

  saveNote(note: Note): void {
    if (this.notesById.has(note.id)) {
      throw duplicateError('Note', note.id)
    }
    this.notesById.set(note.id, cloneNote(note))
  }

  /**
   * Replaces an existing note (workflow mutation). Rejects unknown ids.
   */
  updateNote(note: Note): void {
    if (!this.notesById.has(note.id)) {
      throw createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Note ${note.id} was not found.`,
      })
    }
    this.notesById.set(note.id, cloneNote(note))
  }

  getVersion(id: VersionId): NoteVersion | null {
    const version = this.versionsById.get(id)
    return version ? cloneVersion(version) : null
  }

  listVersionsForNote(noteId: NoteId): readonly NoteVersion[] {
    const ids = this.versionIdsByNoteId.get(noteId) ?? []
    return ids.map((id) => {
      const version = this.versionsById.get(id)
      if (!version) {
        throw createMockApiError({
          code: 'NOT_FOUND',
          status: 404,
          message: `Version ${id} was not found.`,
        })
      }
      return cloneVersion(version)
    })
  }

  /**
   * Inserts an immutable NoteVersion. Content cannot be updated after insertion.
   */
  appendVersion(version: NoteVersion): void {
    if (this.versionsById.has(version.id)) {
      throw duplicateError('NoteVersion', version.id)
    }
    const existingIds = this.versionIdsByNoteId.get(version.noteId) ?? []
    for (const existingId of existingIds) {
      const existing = this.versionsById.get(existingId)
      if (existing && existing.revisionNumber === version.revisionNumber) {
        throw createMockApiError({
          code: 'INVALID_REQUEST',
          status: 400,
          message: `Note ${version.noteId} already has revision ${version.revisionNumber}.`,
          details: { noteId: version.noteId, revisionNumber: version.revisionNumber },
        })
      }
    }
    const frozen = cloneVersion(version)
    this.versionsById.set(version.id, frozen)
    this.versionIdsByNoteId.set(version.noteId, [...existingIds, version.id])
  }

  /**
   * Versions are immutable — any update attempt is rejected.
   */
  updateVersion(_version: NoteVersion): never {
    throw createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: 'NoteVersion records are immutable and cannot be updated.',
    })
  }

  listReviewEvents(noteId: NoteId): readonly ReviewEvent[] {
    const events = this.reviewEventsByNoteId.get(noteId) ?? []
    return events.map(cloneReviewEvent)
  }

  appendReviewEvent(event: ReviewEvent): void {
    if (this.reviewEventsById.has(event.id)) {
      throw duplicateError('ReviewEvent', event.id)
    }
    const existing = this.reviewEventsByNoteId.get(event.noteId) ?? []
    const frozen = cloneReviewEvent(event)
    this.reviewEventsById.set(event.id, frozen)
    this.reviewEventsByNoteId.set(event.noteId, [...existing, frozen])
  }

  /**
   * Review events are immutable — any update attempt is rejected.
   */
  updateReviewEvent(_event: ReviewEvent): never {
    throw createMockApiError({
      code: 'INVALID_REQUEST',
      status: 400,
      message: 'ReviewEvent records are immutable and cannot be updated.',
    })
  }

  getCompletedMutation(id: ClientMutationId): unknown | null {
    if (!this.completedMutations.has(id)) {
      return null
    }
    const value = this.completedMutations.get(id)
    if (value === null || typeof value !== 'object') {
      return value ?? null
    }
    return Object.freeze({ ...(value as Record<string, unknown>) })
  }

  saveCompletedMutation(id: ClientMutationId, value: unknown): void {
    if (this.completedMutations.has(id)) {
      throw duplicateError('CompletedMutation', id)
    }
    this.completedMutations.set(id, value)
  }

  /**
   * Atomically applies a transition commit after preflight checks.
   * Either all mutations succeed or none are applied.
   */
  commitTransition(input: {
    readonly note: Note
    readonly event: ReviewEvent
    readonly newVersion: NoteVersion | null
  }): void {
    if (!this.notesById.has(input.note.id)) {
      throw createMockApiError({
        code: 'NOT_FOUND',
        status: 404,
        message: `Note ${input.note.id} was not found.`,
      })
    }
    if (this.reviewEventsById.has(input.event.id)) {
      throw duplicateError('ReviewEvent', input.event.id)
    }
    if (input.newVersion) {
      if (this.versionsById.has(input.newVersion.id)) {
        throw duplicateError('NoteVersion', input.newVersion.id)
      }
      const existingIds = this.versionIdsByNoteId.get(input.newVersion.noteId) ?? []
      for (const existingId of existingIds) {
        const existing = this.versionsById.get(existingId)
        if (existing && existing.revisionNumber === input.newVersion.revisionNumber) {
          throw createMockApiError({
            code: 'INVALID_REQUEST',
            status: 400,
            message: `Note ${input.newVersion.noteId} already has revision ${input.newVersion.revisionNumber}.`,
          })
        }
      }
    }

    // Preflight passed — apply all mutations. Synchronous Map writes cannot partially
    // observe a failed mid-commit from callers that only see the thrown error after.
    if (input.newVersion) {
      const frozenVersion = cloneVersion(input.newVersion)
      this.versionsById.set(input.newVersion.id, frozenVersion)
      const existingIds = this.versionIdsByNoteId.get(input.newVersion.noteId) ?? []
      this.versionIdsByNoteId.set(input.newVersion.noteId, [...existingIds, input.newVersion.id])
    }
    this.notesById.set(input.note.id, cloneNote(input.note))
    const frozenEvent = cloneReviewEvent(input.event)
    this.reviewEventsById.set(input.event.id, frozenEvent)
    const existingEvents = this.reviewEventsByNoteId.get(input.event.noteId) ?? []
    this.reviewEventsByNoteId.set(input.event.noteId, [...existingEvents, frozenEvent])
  }

  counts(): {
    readonly users: number
    readonly patients: number
    readonly notes: number
    readonly versions: number
    readonly reviewEvents: number
  } {
    let reviewEvents = 0
    for (const events of this.reviewEventsByNoteId.values()) {
      reviewEvents += events.length
    }
    return {
      users: this.usersById.size,
      patients: this.patientsById.size,
      notes: this.notesById.size,
      versions: this.versionsById.size,
      reviewEvents,
    }
  }
}

function duplicateError(kind: string, id: string): MockApiError {
  return createMockApiError({
    code: 'INVALID_REQUEST',
    status: 400,
    message: `${kind} with id ${id} already exists.`,
    details: { kind, id },
  })
}

export { cloneNote, clonePatient, cloneReviewEvent, cloneSoap, cloneUser, cloneVersion }
