import { parseUserId } from '@/domain/ids'
import type { UserRole } from '@/domain/roles'
import { MockDatabase } from '@/mock/database/repository'
import { type SeedConfig, seedMockDatabase } from '@/mock/seed/seed'
import { MockBackendService } from '@/mock/services/backend'
import type { ActorContext } from '@/mock/services/seed-service'

export function createTestDatabase(config: Partial<SeedConfig> = {}): MockDatabase {
  const db = new MockDatabase()
  seedMockDatabase(db, {
    noteCount: 24,
    seed: 99,
    ...config,
  })
  return db
}

export function createTestBackend(config: Partial<SeedConfig> = {}): MockBackendService {
  const backend = new MockBackendService(
    config.seed === undefined ? { autoSeed: false } : { autoSeed: false, seed: config.seed },
  )
  backend.configureForTests()
  seedMockDatabase(backend.database, {
    noteCount: 24,
    seed: 99,
    ...config,
  })
  return backend
}

export function actorForSeed(db: MockDatabase, role: UserRole): ActorContext {
  const user = db.listUsers().find((u) => u.role === role)
  if (!user) {
    throw new Error(`No seeded user with role ${role}`)
  }
  return { userId: user.id, role: user.role }
}

export function adminActor(db: MockDatabase): ActorContext {
  return actorForSeed(db, 'ADMIN')
}

export function auditorActor(db: MockDatabase): ActorContext {
  return actorForSeed(db, 'READONLY_AUDITOR')
}

export function clinicianActor(db: MockDatabase): ActorContext {
  return actorForSeed(db, 'CLINICIAN')
}

export function reviewerActor(db: MockDatabase): ActorContext {
  return actorForSeed(db, 'REVIEWER')
}

export function unknownActor(role: UserRole = 'CLINICIAN'): ActorContext {
  return { userId: parseUserId('usr_unknown_actor'), role }
}
