/**
 * Structured SOAP clinical content.
 * Domain property names are descriptive; transport payloads use S/O/A/P keys.
 * Mappers freeze instances so nested section text is not shared or mutated in place.
 */
export type SoapContent = {
  readonly subjective: string
  readonly objective: string
  readonly assessment: string
  readonly plan: string
}
