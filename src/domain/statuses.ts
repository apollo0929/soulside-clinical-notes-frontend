export const NOTE_STATUSES = [
  'GENERATING',
  'FAILED',
  'READY_FOR_REVIEW',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'AMENDED',
  'LOCKED',
] as const

export type NoteStatus = (typeof NOTE_STATUSES)[number]
