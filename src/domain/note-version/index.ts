export {
  type AncestorChainResult,
  type CommonAncestorResult,
  createVersionLookupFromList,
  findNearestCommonAncestor,
  getAncestorChain,
  validateVersionGraph,
  type VersionGraphIssue,
  type VersionLookup,
} from '@/domain/note-version/version-graph'
export {
  evaluateVersionSavePolicy,
  type EvaluateVersionSavePolicyInput,
  VERSION_SAVE_DENIAL_REASON_CODES,
  type VersionSaveDecision,
  type VersionSaveDenialReasonCode,
} from '@/domain/note-version/version-save-policy'
