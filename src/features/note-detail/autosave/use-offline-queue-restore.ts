import { useEffect, useRef } from 'react'

import type { NoteId } from '@/domain/ids'
import type { SoapContent } from '@/domain/models/soap'
import type { VersionConflictResponseDto } from '@/domain/schemas/conflict'
import type { UseNoteAutosaveResult } from '@/features/note-detail/autosave/use-note-autosave'
import type { UseSoapEditorResult } from '@/features/note-detail/editor/use-soap-editor'
import type { QueuedCreateVersionWrite } from '@/services/offline/offline.types'
import { createQueuedWriteRepository } from '@/services/offline/queued-write.repository'

/**
 * After full reload, restore the latest queued write for this note into the editor.
 *
 * Draft restoration path: IndexedDB `queuedWrites` content → editor
 * `RESTORE_OFFLINE_DRAFT` (not a separate editor-state persistence layer).
 */
export function useOfflineQueueRestore(input: {
  readonly noteId: NoteId | null
  readonly enabled: boolean
  readonly serverContent: SoapContent | null
  readonly soapEditor: UseSoapEditorResult
  readonly autosave: UseNoteAutosaveResult
}): void {
  const { noteId, enabled, soapEditor, autosave } = input
  const restoredIdRef = useRef<string | null>(null)
  const pendingEntryRef = useRef<QueuedCreateVersionWrite | null>(null)
  const isEditing = soapEditor.isEditing
  const hasEditorState = soapEditor.state !== null

  // Phase 1: load queue entry once per note.
  useEffect(() => {
    if (!enabled || noteId === null) {
      return
    }
    let cancelled = false
    void (async () => {
      const rows = await createQueuedWriteRepository().listByNote(noteId)
      if (cancelled || rows.length === 0) {
        return
      }
      const entry =
        rows.find((row) => row.status === 'BLOCKED_CONFLICT') ??
        rows.find((row) => row.status === 'FAILED') ??
        rows.find((row) => row.status === 'REPLAYING') ??
        rows.find((row) => row.status === 'QUEUED') ??
        null
      if (!entry || restoredIdRef.current === entry.id) {
        return
      }
      pendingEntryRef.current = entry
      if (!isEditing) {
        soapEditor.beginEdit()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, noteId, isEditing, soapEditor])

  // Phase 2: once the editor session is open, apply draft + autosave status.
  useEffect(() => {
    const entry = pendingEntryRef.current
    if (!entry || !isEditing || !hasEditorState) {
      return
    }
    if (restoredIdRef.current === entry.id) {
      return
    }
    restoredIdRef.current = entry.id
    soapEditor.dispatch({
      type: 'RESTORE_OFFLINE_DRAFT',
      baseVersionId: entry.baseVersionId,
      draftContent: entry.content,
    })
    // Defer status restore until the autosave coordinator effect has mounted.
    queueMicrotask(() => {
      autosave.restoreFromQueuedWrite({
        queueId: entry.id,
        mutationId: entry.clientMutationId,
        status: entry.status,
        conflict: entry.conflictPayload,
        lastErrorCode: entry.lastErrorCode,
      })
    })
  }, [autosave, hasEditorState, isEditing, soapEditor])
}

export function conflictFromAutosaveStatus(
  status: UseNoteAutosaveResult['status'],
): VersionConflictResponseDto | null {
  if (status.kind === 'CONFLICT' || status.kind === 'BLOCKED_CONFLICT') {
    return status.conflict
  }
  return null
}
