import { z } from 'zod'

import type { Brand } from '@/domain/brand'

export type NoteId = Brand<string, 'NoteId'>
export type VersionId = Brand<string, 'VersionId'>
export type PatientId = Brand<string, 'PatientId'>
export type SessionId = Brand<string, 'SessionId'>
export type UserId = Brand<string, 'UserId'>
export type ReviewEventId = Brand<string, 'ReviewEventId'>
export type ClientMutationId = Brand<string, 'ClientMutationId'>
export type RealtimeEventId = Brand<string, 'RealtimeEventId'>
export type TelemetryEventId = Brand<string, 'TelemetryEventId'>
export type TelemetrySessionId = Brand<string, 'TelemetrySessionId'>
export type TelemetryBatchId = Brand<string, 'TelemetryBatchId'>

function createBrandedIdSchema<TBrand extends string>(brand: TBrand) {
  return z
    .string()
    .trim()
    .min(1, `${brand} must be a non-empty string`)
    .transform((value) => value as Brand<string, TBrand>)
}

export const noteIdSchema = createBrandedIdSchema('NoteId')
export const versionIdSchema = createBrandedIdSchema('VersionId')
export const patientIdSchema = createBrandedIdSchema('PatientId')
export const sessionIdSchema = createBrandedIdSchema('SessionId')
export const userIdSchema = createBrandedIdSchema('UserId')
export const reviewEventIdSchema = createBrandedIdSchema('ReviewEventId')
export const clientMutationIdSchema = createBrandedIdSchema('ClientMutationId')
export const realtimeEventIdSchema = createBrandedIdSchema('RealtimeEventId')
export const telemetryEventIdSchema = createBrandedIdSchema('TelemetryEventId')
export const telemetrySessionIdSchema = createBrandedIdSchema('TelemetrySessionId')
export const telemetryBatchIdSchema = createBrandedIdSchema('TelemetryBatchId')

export function parseNoteId(value: string): NoteId {
  return noteIdSchema.parse(value)
}

export function parseVersionId(value: string): VersionId {
  return versionIdSchema.parse(value)
}

export function parsePatientId(value: string): PatientId {
  return patientIdSchema.parse(value)
}

export function parseSessionId(value: string): SessionId {
  return sessionIdSchema.parse(value)
}

export function parseUserId(value: string): UserId {
  return userIdSchema.parse(value)
}

export function parseReviewEventId(value: string): ReviewEventId {
  return reviewEventIdSchema.parse(value)
}

export function parseClientMutationId(value: string): ClientMutationId {
  return clientMutationIdSchema.parse(value)
}

export function parseRealtimeEventId(value: string): RealtimeEventId {
  return realtimeEventIdSchema.parse(value)
}

export function parseTelemetryEventId(value: string): TelemetryEventId {
  return telemetryEventIdSchema.parse(value)
}

export function parseTelemetrySessionId(value: string): TelemetrySessionId {
  return telemetrySessionIdSchema.parse(value)
}

export function parseTelemetryBatchId(value: string): TelemetryBatchId {
  return telemetryBatchIdSchema.parse(value)
}
