import type { NoteId, VersionId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'

export type ReplaySuccessListener = (input: {
  readonly noteId: NoteId
  readonly versionId: VersionId
  readonly content: SoapContent
  readonly mutationId: import('@/domain/ids').ClientMutationId
}) => void

const listeners = new Set<ReplaySuccessListener>()

export function subscribeReplaySuccess(listener: ReplaySuccessListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function notifyReplaySuccess(input: Parameters<ReplaySuccessListener>[0]): void {
  for (const listener of listeners) {
    listener(input)
  }
}
