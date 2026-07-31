import type { UserId } from '@/domain/ids'

export type AssignReviewerEffect = {
  readonly type: 'ASSIGN_REVIEWER'
  readonly reviewerId: UserId
}

export type ReleaseReviewerEffect = {
  readonly type: 'RELEASE_REVIEWER'
}

export type RequireNewVersionEffect = {
  readonly type: 'REQUIRE_NEW_VERSION'
}

export type RecordRejectionReasonEffect = {
  readonly type: 'RECORD_REJECTION_REASON'
  readonly reason: string
}

export type TransitionEffect =
  | AssignReviewerEffect
  | ReleaseReviewerEffect
  | RequireNewVersionEffect
  | RecordRejectionReasonEffect
