import type { VersionId } from '@/domain/ids'
import type { NoteVersionRef } from '@/domain/models/note-version'

function formatTimestamp(value: string): string {
  return value.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')
}

export type VersionHistoryProps = {
  readonly versions: readonly NoteVersionRef[]
  readonly currentVersionId: VersionId
  readonly baseVersionId: VersionId | null
  readonly compareVersionId: VersionId | null
  readonly onSelectBase: (versionId: VersionId) => void
  readonly onSelectCompare: (versionId: VersionId) => void
  readonly compareDisabled: boolean
}

export function VersionHistory({
  versions,
  currentVersionId,
  baseVersionId,
  compareVersionId,
  onSelectBase,
  onSelectCompare,
  compareDisabled,
}: VersionHistoryProps) {
  return (
    <nav className="version-history" aria-labelledby="version-history-heading">
      <h2 id="version-history-heading">Version history</h2>
      <p className="version-history__help">
        Newest revision first. Select Base (older) and Compare (newer) versions. Selection is local
        and does not change the note.
      </p>

      {compareDisabled ? (
        <p role="status">Only one version exists. Comparison controls are disabled.</p>
      ) : null}

      <div className="version-history__scroll" tabIndex={0} aria-label="Scrollable version list">
        <ul className="version-history__list">
          {versions.map((version) => {
            const isCurrent = version.id === currentVersionId
            const baseId = `version-base-${version.id}`
            const compareId = `version-compare-${version.id}`
            const currentSuffix = isCurrent ? ', current' : ''
            return (
              <li key={version.id} className="version-history__item">
                <div className="version-history__summary">
                  <span className="version-history__revision">
                    Revision {version.revisionNumber}
                    {isCurrent ? (
                      <span className="version-history__current"> (current)</span>
                    ) : null}
                  </span>
                  <span className="version-history__author">{version.authorRole}</span>
                  <time dateTime={version.createdAt}>{formatTimestamp(version.createdAt)}</time>
                  {version.parentVersionId ? (
                    <span className="version-history__parent">
                      Parent: {version.parentVersionId}
                    </span>
                  ) : (
                    <span className="version-history__parent">Root version</span>
                  )}
                </div>
                <div className="version-history__selectors">
                  <label htmlFor={baseId}>
                    <input
                      id={baseId}
                      type="radio"
                      name="version-base"
                      checked={baseVersionId === version.id}
                      disabled={compareDisabled}
                      aria-label={`Base, revision ${version.revisionNumber}${currentSuffix}`}
                      onChange={() => {
                        onSelectBase(version.id)
                      }}
                    />
                    Base
                  </label>
                  <label htmlFor={compareId}>
                    <input
                      id={compareId}
                      type="radio"
                      name="version-compare"
                      checked={compareVersionId === version.id}
                      disabled={compareDisabled}
                      aria-label={`Compare, revision ${version.revisionNumber}${currentSuffix}`}
                      onChange={() => {
                        onSelectCompare(version.id)
                      }}
                    />
                    Compare
                  </label>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </nav>
  )
}
