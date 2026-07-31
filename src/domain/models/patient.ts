import type { PatientId } from '@/domain/ids'

export type Patient = {
  readonly id: PatientId
  readonly displayName: string
}
