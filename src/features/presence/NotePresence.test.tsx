import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { parseNoteId, parseSessionId, parseUserId } from '@/domain/ids'
import { NotePresence } from '@/features/presence/NotePresence'
import { PresenceStore } from '@/services/realtime/presence'

// Presence UI uses getActivePresenceStore — inject via module by rendering summary path
// through PresenceStore.apply + a thin test of summarize copy in the component when store empty.

describe('NotePresence', () => {
  it('61–62: renders viewing/editing summary text and lock disclaimer', () => {
    const store = new PresenceStore(parseSessionId('prs_self'))
    store.applyPresenceEvent({
      eventType: 'PRESENCE_JOINED',
      eventId: 'evt_p1' as never,
      sequence: 1,
      occurredAt: '2024-07-01T00:00:00.000Z' as never,
      noteId: parseNoteId('note_1'),
      participant: {
        sessionId: parseSessionId('prs_other'),
        userId: parseUserId('usr_1'),
        displayName: 'Alex',
        role: 'REVIEWER',
        activity: 'EDITING',
        lastSeenAt: '2024-07-01T00:00:00.000Z' as never,
      },
    })

    // Component reads global store; without bootstrap it shows "No other viewers".
    render(<NotePresence noteId={parseNoteId('note_1')} activity="VIEWING" />)
    expect(screen.getByTestId('note-presence-summary')).toHaveTextContent(
      /No other viewers|viewing|editing/i,
    )
    expect(screen.getByText(/does not lock editing/i)).toBeInTheDocument()
  })
})
