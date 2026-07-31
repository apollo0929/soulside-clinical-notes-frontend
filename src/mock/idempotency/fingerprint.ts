import type { NoteId, UserId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'

/**
 * Deterministic request fingerprint for CREATE_NOTE_VERSION.
 * Field order is stable. Role is excluded; actor user ID is authoritative.
 * occurredAt is excluded so retries after time passes remain identical.
 */
export function buildCreateVersionFingerprint(input: {
  readonly noteId: NoteId
  readonly baseVersionId: VersionId
  readonly content: SoapContent
  readonly actorUserId: UserId
}): string {
  return [
    'CREATE_NOTE_VERSION',
    input.noteId,
    input.baseVersionId,
    input.actorUserId,
    escapeField(input.content.subjective),
    escapeField(input.content.objective),
    escapeField(input.content.assessment),
    escapeField(input.content.plan),
  ].join('\u001f')
}

function escapeField(value: string): string {
  return value.split('\u001f').join('\\u001f')
}
