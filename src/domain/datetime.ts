import { z } from 'zod'

import type { Brand } from '@/domain/brand'

/**
 * Validated ISO-8601 UTC timestamp string (e.g. 2025-11-04T14:41:02Z).
 * Domain code keeps timestamps as strings — never as Date objects.
 */
export type IsoDateTime = Brand<string, 'IsoDateTime'>

export const isoDateTimeSchema = z.iso.datetime().transform((value) => value as IsoDateTime)

export function parseIsoDateTime(value: string): IsoDateTime {
  return isoDateTimeSchema.parse(value)
}
