import { useMemo } from 'react'

import type { SoapContent } from '@/domain/models/soap'
import type { WordDiffSegment } from '@/shared/diff'
import { diffWords } from '@/shared/diff'

const SECTIONS = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
] as const

export type SoapDiffProps = {
  readonly baseContent: SoapContent
  readonly compareContent: SoapContent
  readonly baseLabel: string
  readonly compareLabel: string
}

function DiffSegments({ segments }: { readonly segments: readonly WordDiffSegment[] }) {
  if (segments.length === 0) {
    return <p className="soap-sections__empty">No content</p>
  }

  return (
    <p className="soap-diff__body">
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

export function SoapDiff({ baseContent, compareContent, baseLabel, compareLabel }: SoapDiffProps) {
  const sectionDiffs = useMemo(
    () =>
      SECTIONS.map((section) => ({
        ...section,
        segments: diffWords(baseContent[section.key], compareContent[section.key]),
      })),
    [baseContent, compareContent],
  )

  return (
    <section className="soap-diff" aria-labelledby="soap-diff-heading">
      <h2 id="soap-diff-heading">SOAP comparison</h2>
      <p>
        Comparing <strong>Base</strong> ({baseLabel}) to <strong>Compare</strong> ({compareLabel}).
      </p>
      <div className="soap-diff__legend" role="group" aria-label="Diff legend">
        <p>
          <ins className="soap-diff__added">Added text</ins>
          <span className="visually-hidden"> appears underlined as an insertion.</span>
          {' · '}
          <del className="soap-diff__removed">Removed text</del>
          <span className="visually-hidden"> appears struck through as a deletion.</span>
        </p>
      </div>
      {sectionDiffs.map((section) => (
        <section
          key={section.key}
          className="soap-sections__section"
          aria-labelledby={`soap-diff-${section.key}-heading`}
        >
          <h3 id={`soap-diff-${section.key}-heading`}>{section.label}</h3>
          <DiffSegments segments={section.segments} />
        </section>
      ))}
    </section>
  )
}
