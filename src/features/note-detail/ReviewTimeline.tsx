import type { ReviewEvent } from '@/domain/models/review-event'

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
}

export type ReviewTimelineProps = {
  readonly events: readonly ReviewEvent[]
}

export function ReviewTimeline({ events }: ReviewTimelineProps) {
  return (
    <section className="review-timeline" aria-labelledby="review-timeline-heading">
      <h2 id="review-timeline-heading">Review timeline</h2>
      <p className="review-timeline__help">Newest events first.</p>
      {events.length === 0 ? (
        <p role="status">No review events recorded for this note.</p>
      ) : (
        <ol className="review-timeline__list">
          {events.map((event) => (
            <li key={event.id} className="review-timeline__item">
              <p>
                <span className={`notes-status notes-status--${event.fromStatus.toLowerCase()}`}>
                  {event.fromStatus.replaceAll('_', ' ')}
                </span>
                {' → '}
                <span>{event.toStatus.replaceAll('_', ' ')}</span>
              </p>
              <p>
                Actor: {event.actorRole} ({event.actorId})
              </p>
              <p>
                <time dateTime={event.occurredAt}>{formatTimestamp(event.occurredAt)}</time>
              </p>
              <p>Version: {event.versionId}</p>
              {event.reason ? <p>Reason: {event.reason}</p> : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
