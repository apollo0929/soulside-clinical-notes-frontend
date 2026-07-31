import { z } from 'zod'

/**
 * Transport SOAP sections use S/O/A/P keys.
 * Unknown section keys are rejected (strictObject) — they are not stripped.
 * Empty section strings are permitted.
 */
export const soapSectionsDtoSchema = z.strictObject({
  S: z.string(),
  O: z.string(),
  A: z.string(),
  P: z.string(),
})

export const soapContentDtoSchema = z.strictObject({
  sections: soapSectionsDtoSchema,
})

export type SoapContentDto = z.infer<typeof soapContentDtoSchema>
export type SoapSectionsDto = z.infer<typeof soapSectionsDtoSchema>
