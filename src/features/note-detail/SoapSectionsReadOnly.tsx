import type { SoapContent } from '@/domain/models/soap'

const SECTIONS = [
  { key: 'subjective', label: 'Subjective' },
  { key: 'objective', label: 'Objective' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'plan', label: 'Plan' },
] as const

export type SoapSectionsReadOnlyProps = {
  readonly content: SoapContent
  readonly headingId?: string
}

export function SoapSectionsReadOnly({
  content,
  headingId = 'soap-sections-heading',
}: SoapSectionsReadOnlyProps) {
  return (
    <section className="soap-sections" aria-labelledby={headingId}>
      <h2 id={headingId}>SOAP content</h2>
      {SECTIONS.map((section) => {
        const value = content[section.key]
        const empty = value.trim().length === 0
        return (
          <section
            key={section.key}
            className="soap-sections__section"
            aria-labelledby={`soap-${section.key}-heading`}
          >
            <h3 id={`soap-${section.key}-heading`}>{section.label}</h3>
            {empty ? (
              <p className="soap-sections__empty">No content</p>
            ) : (
              <p className="soap-sections__body">{value}</p>
            )}
          </section>
        )
      })}
    </section>
  )
}
