import type { IsoDateTime } from '@/domain/datetime'
import { parseIsoDateTime } from '@/domain/datetime'
import {
  parseNoteId,
  parsePatientId,
  parseReviewEventId,
  parseSessionId,
  parseUserId,
  parseVersionId,
} from '@/domain/ids'
import type { Note } from '@/domain/models/note'
import type { NoteVersion } from '@/domain/models/note-version'
import type { Patient } from '@/domain/models/patient'
import type { ReviewEvent } from '@/domain/models/review-event'
import type { SoapContent } from '@/domain/models/soap'
import type { User } from '@/domain/models/user'
import type { NoteStatus } from '@/domain/statuses'
import { NOTE_STATUSES } from '@/domain/statuses'
import type { MockDatabase, MockDatabaseSnapshot } from '@/mock/database/repository'
import { assertMockDatabaseIntegrity } from '@/mock/database/validate'
import { createMulberry32, type DeterministicRandom } from '@/mock/prng'

export type SeedConfig = {
  readonly seed: number
  readonly noteCount: number
  readonly clinicianCount: number
  readonly reviewerCount: number
  readonly patientCount: number
  readonly baseTimestamp: IsoDateTime
}

export const DEFAULT_SEED_CONFIG: SeedConfig = Object.freeze({
  seed: 42,
  noteCount: 48,
  clinicianCount: 5,
  reviewerCount: 5,
  patientCount: 20,
  baseTimestamp: parseIsoDateTime('2024-06-01T12:00:00.000Z'),
})

export const MAX_SEED_NOTE_COUNT = 100_000

const FIRST_NAMES = [
  'Avery',
  'Blake',
  'Cameron',
  'Dana',
  'Ellis',
  'Finley',
  'Harper',
  'Jordan',
  'Kai',
  'Logan',
  'Morgan',
  'Parker',
  'Quinn',
  'Riley',
  'Sage',
  'Taylor',
] as const

const LAST_NAMES = [
  'Nguyen',
  'Patel',
  'Garcia',
  'Kim',
  'Johnson',
  'Williams',
  'Brown',
  'Davis',
  'Martinez',
  'Lopez',
  'Wilson',
  'Anderson',
  'Thomas',
  'Jackson',
  'White',
  'Harris',
] as const

const SOAP_SNIPPETS = [
  'reports improved sleep',
  'denies chest pain',
  'blood pressure stable',
  'continues SSRI',
  'follow up in two weeks',
  'anxious about work',
  'good medication adherence',
  'no acute distress',
] as const

export type SeedResult = {
  readonly config: SeedConfig
  readonly counts: {
    readonly users: number
    readonly patients: number
    readonly notes: number
    readonly versions: number
    readonly reviewEvents: number
  }
}

export function createSeedConfig(overrides: Partial<SeedConfig> = {}): SeedConfig {
  return Object.freeze({
    ...DEFAULT_SEED_CONFIG,
    ...overrides,
    baseTimestamp: parseIsoDateTime(overrides.baseTimestamp ?? DEFAULT_SEED_CONFIG.baseTimestamp),
  })
}

/**
 * Resets the database and seeds a deterministic dataset.
 * Validates integrity in development and test environments.
 */
export function seedMockDatabase(
  db: MockDatabase,
  configInput: Partial<SeedConfig> = {},
): SeedResult {
  const config = createSeedConfig(configInput)
  validateSeedConfig(config)

  const random = createMulberry32(config.seed)
  const snapshot = buildSeedSnapshot(config, random)
  db.replaceAll(snapshot)

  if (shouldValidateIntegrity()) {
    assertMockDatabaseIntegrity(db)
  }

  return {
    config,
    counts: db.counts(),
  }
}

export function validateSeedConfig(config: SeedConfig): void {
  if (!Number.isInteger(config.seed)) {
    throw new Error('Seed must be an integer')
  }
  if (!Number.isInteger(config.noteCount) || config.noteCount < 0) {
    throw new Error('noteCount must be a non-negative integer')
  }
  if (config.noteCount > MAX_SEED_NOTE_COUNT) {
    throw new Error(`noteCount cannot exceed ${MAX_SEED_NOTE_COUNT}`)
  }
  if (config.clinicianCount < 1 || config.reviewerCount < 1 || config.patientCount < 1) {
    throw new Error('clinicianCount, reviewerCount, and patientCount must be at least 1')
  }
}

function shouldValidateIntegrity(): boolean {
  const mode = import.meta.env.MODE
  return mode === 'development' || mode === 'test'
}

function buildSeedSnapshot(config: SeedConfig, random: DeterministicRandom): MockDatabaseSnapshot {
  const clinicians = buildUsers('clinician', 'CLINICIAN', config.clinicianCount, config.seed)
  const reviewers = buildUsers('reviewer', 'REVIEWER', config.reviewerCount, config.seed)
  const admin: User = Object.freeze({
    id: parseUserId(`usr_admin_${config.seed}`),
    displayName: 'Admin User',
    role: 'ADMIN' as const,
  })
  const auditor: User = Object.freeze({
    id: parseUserId(`usr_auditor_${config.seed}`),
    displayName: 'Read Only Auditor',
    role: 'READONLY_AUDITOR' as const,
  })
  const users = [...clinicians, ...reviewers, admin, auditor]

  const patients = buildPatients(config.patientCount, config.seed, random)

  const notes: Note[] = []
  const versions: NoteVersion[] = []
  const reviewEvents: ReviewEvent[] = []

  for (let i = 0; i < config.noteCount; i += 1) {
    const built = buildNoteBundle({
      index: i,
      config,
      random,
      clinicians,
      reviewers,
      patients,
    })
    notes.push(built.note)
    versions.push(...built.versions)
    reviewEvents.push(...built.events)
  }

  return {
    users,
    patients,
    notes,
    versions,
    reviewEvents,
    completedMutationIds: [],
  }
}

function buildUsers(
  kind: 'clinician' | 'reviewer',
  role: 'CLINICIAN' | 'REVIEWER',
  count: number,
  seed: number,
): User[] {
  const users: User[] = []
  for (let i = 0; i < count; i += 1) {
    users.push(
      Object.freeze({
        id: parseUserId(`usr_${kind}_${seed}_${i}`),
        displayName: `${kind === 'clinician' ? 'Clinician' : 'Reviewer'} ${i + 1}`,
        role,
      }),
    )
  }
  return users
}

function buildPatients(count: number, seed: number, random: DeterministicRandom): Patient[] {
  const patients: Patient[] = []
  for (let i = 0; i < count; i += 1) {
    const first = random.pick(FIRST_NAMES)
    const last = random.pick(LAST_NAMES)
    patients.push(
      Object.freeze({
        id: parsePatientId(`pat_${seed}_${i}`),
        displayName: `${first} ${last}`,
      }),
    )
  }
  return patients
}

function buildNoteBundle(input: {
  readonly index: number
  readonly config: SeedConfig
  readonly random: DeterministicRandom
  readonly clinicians: readonly User[]
  readonly reviewers: readonly User[]
  readonly patients: readonly Patient[]
}): {
  readonly note: Note
  readonly versions: readonly NoteVersion[]
  readonly events: readonly ReviewEvent[]
} {
  const { index, config, random, clinicians, reviewers, patients } = input
  const status = pickStatus(index, config.noteCount, random)
  const clinician = clinicians[index % clinicians.length]
  const patient = patients[index % patients.length]
  if (!clinician || !patient) {
    throw new Error('Seed generation missing clinician or patient')
  }

  const createdAt = offsetTimestamp(config.baseTimestamp, index * 60_000)
  const updatedAt = offsetTimestamp(createdAt, random.nextInt(0, 3_600_000))
  const noteId = parseNoteId(`note_${config.seed}_${index}`)
  const sessionId = parseSessionId(`sess_${config.seed}_${index}`)

  const versionCount =
    status === 'AMENDED' || status === 'APPROVED' || status === 'REJECTED'
      ? random.nextInt(2, 4)
      : 1

  const versions: NoteVersion[] = []
  let parentVersionId: ReturnType<typeof parseVersionId> | null = null
  for (let revision = 1; revision <= versionCount; revision += 1) {
    const versionId = parseVersionId(`ver_${config.seed}_${index}_${revision}`)
    const content = buildSoapContent(config.seed, index, revision, random)
    versions.push(
      Object.freeze({
        id: versionId,
        noteId,
        revisionNumber: revision,
        parentVersionId,
        content,
        authorId: clinician.id,
        authorRole: 'CLINICIAN' as const,
        createdAt: offsetTimestamp(createdAt, (revision - 1) * 30_000),
      }),
    )
    parentVersionId = versionId
  }

  const currentVersion = versions[versions.length - 1]
  if (!currentVersion) {
    throw new Error('Expected at least one version')
  }

  let assignedReviewerId = null as User['id'] | null
  if (status === 'IN_REVIEW') {
    const reviewer = reviewers[index % reviewers.length]
    if (!reviewer) {
      throw new Error('Seed generation missing reviewer')
    }
    assignedReviewerId = reviewer.id
  }

  const note: Note = Object.freeze({
    id: noteId,
    patientId: patient.id,
    sessionId,
    status,
    currentVersionId: currentVersion.id,
    assignedReviewerId,
    createdAt,
    updatedAt,
  })

  const events = buildReviewEventsForStatus({
    note,
    versions,
    clinician,
    reviewers,
    random,
    seed: config.seed,
    index,
  })

  return { note, versions, events }
}

function pickStatus(index: number, noteCount: number, random: DeterministicRandom): NoteStatus {
  // Guarantee every status appears when noteCount is large enough.
  if (index < NOTE_STATUSES.length && noteCount >= NOTE_STATUSES.length) {
    const status = NOTE_STATUSES[index]
    if (status) {
      return status
    }
  }
  return random.pick(NOTE_STATUSES)
}

function buildSoapContent(
  seed: number,
  noteIndex: number,
  revision: number,
  random: DeterministicRandom,
): SoapContent {
  const snippet = random.pick(SOAP_SNIPPETS)
  return Object.freeze({
    subjective: `S seed=${seed} note=${noteIndex} rev=${revision}: patient ${snippet}.`,
    objective: `O seed=${seed} note=${noteIndex} rev=${revision}: vitals reviewed.`,
    assessment: `A seed=${seed} note=${noteIndex} rev=${revision}: stable presentation.`,
    plan: `P seed=${seed} note=${noteIndex} rev=${revision}: continue current plan.`,
  })
}

function buildReviewEventsForStatus(input: {
  readonly note: Note
  readonly versions: readonly NoteVersion[]
  readonly clinician: User
  readonly reviewers: readonly User[]
  readonly random: DeterministicRandom
  readonly seed: number
  readonly index: number
}): ReviewEvent[] {
  const { note, versions, clinician, reviewers, seed, index } = input
  const head = versions[versions.length - 1]
  if (!head) {
    return []
  }

  const events: ReviewEvent[] = []
  const push = (
    fromStatus: NoteStatus,
    toStatus: NoteStatus,
    actor: User,
    reason: string | null,
    offsetMs: number,
  ): void => {
    events.push(
      Object.freeze({
        id: parseReviewEventId(`rev_${seed}_${index}_${events.length}`),
        noteId: note.id,
        versionId: head.id,
        fromStatus,
        toStatus,
        actorId: actor.id,
        actorRole: actor.role,
        reason,
        occurredAt: offsetTimestamp(note.createdAt, offsetMs),
      }),
    )
  }

  switch (note.status) {
    case 'READY_FOR_REVIEW':
      push('GENERATING', 'READY_FOR_REVIEW', clinician, null, 10_000)
      break
    case 'IN_REVIEW': {
      const reviewer = reviewers[index % reviewers.length]
      if (!reviewer) {
        throw new Error('Missing reviewer for IN_REVIEW event')
      }
      push('GENERATING', 'READY_FOR_REVIEW', clinician, null, 10_000)
      push('READY_FOR_REVIEW', 'IN_REVIEW', reviewer, null, 20_000)
      break
    }
    case 'APPROVED': {
      const reviewer = reviewers[index % reviewers.length]
      if (!reviewer) {
        throw new Error('Missing reviewer for APPROVED event')
      }
      push('GENERATING', 'READY_FOR_REVIEW', clinician, null, 10_000)
      push('READY_FOR_REVIEW', 'IN_REVIEW', reviewer, null, 20_000)
      push('IN_REVIEW', 'APPROVED', reviewer, null, 30_000)
      break
    }
    case 'REJECTED': {
      const reviewer = reviewers[index % reviewers.length]
      if (!reviewer) {
        throw new Error('Missing reviewer for REJECTED event')
      }
      push('GENERATING', 'READY_FOR_REVIEW', clinician, null, 10_000)
      push('READY_FOR_REVIEW', 'IN_REVIEW', reviewer, null, 20_000)
      push('IN_REVIEW', 'REJECTED', reviewer, 'Insufficient documentation', 30_000)
      break
    }
    case 'AMENDED': {
      const reviewer = reviewers[index % reviewers.length]
      if (!reviewer) {
        throw new Error('Missing reviewer for AMENDED event')
      }
      push('GENERATING', 'READY_FOR_REVIEW', clinician, null, 10_000)
      push('READY_FOR_REVIEW', 'IN_REVIEW', reviewer, null, 20_000)
      push('IN_REVIEW', 'APPROVED', reviewer, null, 30_000)
      push('APPROVED', 'AMENDED', clinician, null, 40_000)
      break
    }
    case 'LOCKED': {
      const reviewer = reviewers[index % reviewers.length]
      if (!reviewer) {
        throw new Error('Missing reviewer for LOCKED event')
      }
      push('GENERATING', 'READY_FOR_REVIEW', clinician, null, 10_000)
      push('READY_FOR_REVIEW', 'IN_REVIEW', reviewer, null, 20_000)
      push('IN_REVIEW', 'APPROVED', reviewer, null, 30_000)
      push('APPROVED', 'LOCKED', clinician, null, 86_400_000 + 1)
      break
    }
    case 'FAILED':
      push('GENERATING', 'FAILED', clinician, null, 5_000)
      break
    case 'GENERATING':
    default:
      break
  }

  return events
}

function offsetTimestamp(base: IsoDateTime, offsetMs: number): IsoDateTime {
  const ms = Date.parse(base) + offsetMs
  return parseIsoDateTime(new Date(ms).toISOString())
}
