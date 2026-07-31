import { useMemo } from 'react'

import { diffWords, type WordDiffSegment } from '@/shared/diff'

export type ConflictDiffProps = {
  readonly label: string
  readonly baseLabel: string
  readonly compareLabel: string
  readonly base: string
  readonly compare: string
}

function DiffSegments({ segments }: { readonly segments: readonly WordDiffSegment[] }) {
  if (segments.length === 0) {
    return <p className="conflict-diff__empty">Empty section</p>
  }
  return (
    <p className="conflict-diff__body">
      {segments.map((segment, index) => {
        if (segment.kind === 'UNCHANGED') {
          return <span key={`u-${index}`}>{segment.value}</span>
        }
        if (segment.kind === 'ADDED') {
          return (
            <ins key={`a-${index}`} className="soap-diff__added">
              <span className="visually-hidden">Added: </span>
              {segment.value}
            </ins>
          )
        }
        return (
          <del key={`r-${index}`} className="soap-diff__removed">
            <span className="visually-hidden">Removed: </span>
            {segment.value}
          </del>
        )
      })}
    </p>
  )
}

export function ConflictDiff({ label, baseLabel, compareLabel, base, compare }: ConflictDiffProps) {
  const segments = useMemo(() => diffWords(base, compare), [base, compare])
  return (
    <div className="conflict-diff">
      <p className="conflict-diff__caption">
        {label}: {baseLabel} → {compareLabel}
      </p>
      <DiffSegments segments={segments} />
    </div>
  )
}
