import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'

import type { NoteId } from '@/domain/ids'
import type { PresenceActivity } from '@/domain/schemas/realtime'
import { getActivePresenceStore, getOrCreatePresenceSessionId } from '@/services/realtime'
import { summarizePresence } from '@/services/realtime/presence'
import {
  joinNotePresence,
  leaveNotePresence,
  startPresenceHeartbeat,
} from '@/services/realtime/presence-api'

export type NotePresenceProps = {
  readonly noteId: NoteId
  readonly activity: PresenceActivity
}

/**
 * Informational presence for the open note. Not an edit lock.
 */
export function NotePresence({ noteId, activity }: NotePresenceProps) {
  const headingId = useId()
  const sessionId = getOrCreatePresenceSessionId()
  const [disclosureOpen, setDisclosureOpen] = useState(false)
  const previousSummary = useRef<string | null>(null)
  const [announce, setAnnounce] = useState('')

  useEffect(() => {
    let cancelled = false
    let stopHeartbeat: (() => void) | null = null
    void (async () => {
      try {
        await joinNotePresence({ noteId, activity, sessionId })
      } catch {
        return
      }
      if (cancelled) {
        return
      }
      stopHeartbeat = startPresenceHeartbeat(sessionId)
    })()
    return () => {
      cancelled = true
      stopHeartbeat?.()
      void leaveNotePresence(sessionId).catch(() => undefined)
    }
  }, [activity, noteId, sessionId])

  const revision = useSyncExternalStore(
    (listener) => {
      const store = getActivePresenceStore()
      if (!store) {
        return () => undefined
      }
      return store.subscribe(listener)
    },
    () => getActivePresenceStore()?.getRevision() ?? 0,
    () => 0,
  )

  const store = getActivePresenceStore()
  const participants = store ? store.listParticipants(noteId) : []
  void revision

  const summary = summarizePresence(participants)

  useEffect(() => {
    if (previousSummary.current === null) {
      previousSummary.current = summary
      return
    }
    if (previousSummary.current !== summary) {
      previousSummary.current = summary
      setAnnounce(summary)
    }
  }, [summary])

  return (
    <section className="note-presence" aria-labelledby={headingId} data-testid="note-presence">
      <h2 id={headingId} className="visually-hidden">
        People viewing this note
      </h2>
      <p className="note-presence__summary" data-testid="note-presence-summary">
        {summary}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </p>
      {participants.length > 1 ? (
        <details
          className="note-presence__details"
          open={disclosureOpen}
          onToggle={(event) => {
            setDisclosureOpen((event.target as HTMLDetailsElement).open)
          }}
        >
          <summary>Show who is here</summary>
          <ul className="note-presence__list">
            {participants.map((participant) => (
              <li key={participant.sessionId}>
                {participant.displayName} ({participant.role}) —{' '}
                {participant.activity === 'EDITING' ? 'editing' : 'viewing'}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="note-presence__hint">Presence is informational and does not lock editing.</p>
    </section>
  )
}
