/**
 * Structured SOAP clinical content.
 * Domain property names are descriptive; transport payloads use S/O/A/P keys.
 * Mappers freeze instances so nested section text is not shared or mutated in place.
 */
export const SOAP_SECTION_KEYS = ['subjective', 'objective', 'assessment', 'plan'] as const

export type SoapSectionKey = (typeof SOAP_SECTION_KEYS)[number]

export type SoapContent = {
  readonly subjective: string
  readonly objective: string
  readonly assessment: string
  readonly plan: string
}

/** Defensive copy + freeze so callers cannot mutate editor/domain SOAP by reference. */
export function cloneSoapContent(content: SoapContent): SoapContent {
  return Object.freeze({
    subjective: content.subjective,
    objective: content.objective,
    assessment: content.assessment,
    plan: content.plan,
  })
}
