import { Link } from 'react-router-dom'

import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import type { NoteVersionRef } from '@/domain/models/note-version'

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
}

export type NoteHeaderProps = {
  readonly aggregate: NoteDetailAggregate
  readonly backHref: string
}

export function NoteHeader({ aggregate, backHref }: NoteHeaderProps) {
  const { note, patient, assignedReviewer, currentVersion } = aggregate

  return (
    <header className="note-detail-header">
      <p className="note-detail-header__back">
        <Link to={backHref} className="note-detail-header__back-link">
          Back to notes
        </Link>
      </p>
      <h1 id="note-detail-heading">{patient.displayName}</h1>
      <dl className="note-detail-header__meta">
        <div>
          <dt>Status</dt>
          <dd>
            <span className={`notes-status notes-status--${note.status.toLowerCase()}`}>
              {note.status.replaceAll('_', ' ')}
            </span>
          </dd>
        </div>
        <div>
          <dt>Revision</dt>
          <dd>{currentVersion.revisionNumber}</dd>
        </div>
        <div>
          <dt>Assigned reviewer</dt>
          <dd>{assignedReviewer?.displayName ?? 'Unassigned'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={note.createdAt}>{formatTimestamp(note.createdAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            <time dateTime={note.updatedAt}>{formatTimestamp(note.updatedAt)}</time>
          </dd>
        </div>
        <div>
          <dt>Note ID</dt>
          <dd>
            <code>{note.id}</code>
          </dd>
        </div>
      </dl>
    </header>
  )
}

export type { NoteVersionRef }
