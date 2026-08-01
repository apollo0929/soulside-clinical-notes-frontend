export type { InProcessRealtimeTransportOptions } from '@/services/realtime/in-process-transport'
export { InProcessRealtimeTransport } from '@/services/realtime/in-process-transport'
export { SseRealtimeTransport } from '@/services/realtime/mock-sse-transport'
export {
  getMutationCorrelationStore,
  isLocalMutation,
  MutationCorrelationStore,
  rememberLocalMutation,
  resetMutationCorrelationForTests,
} from '@/services/realtime/mutation-correlation'
export {
  createPresenceHeartbeatController,
  isPresenceEvent,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_LEASE_MS,
  type PresenceHeartbeatController,
  type PresenceScheduler,
  PresenceStore,
  type PresenceSummary,
  summarizePresence,
} from '@/services/realtime/presence'
export { getOrCreatePresenceSessionId } from '@/services/realtime/presence-session'
export {
  ensureRealtimeBootstrap,
  getActivePresenceStore,
  getActiveRealtimeCoordinator,
  getSharedMutationCorrelationStore,
  type RealtimeBootstrapDeps,
  reconcileRealtimeEvent,
  registerLocalMutation,
  resetRealtimeBootstrapForTests,
  subscribeRealtimeCoordinatorReady,
} from '@/services/realtime/realtime-bootstrap'
export {
  clearPersistedLastEventId,
  createRealtimeCoordinator,
  REALTIME_BACKOFF_MS,
  RealtimeCoordinator,
  type RealtimeCoordinatorDeps,
  type RealtimeCoordinatorHandlers,
  type RealtimeScheduler,
  RECENT_EVENT_ID_CAPACITY,
} from '@/services/realtime/realtime-coordinator'
export {
  parseRealtimeEvent,
  type RealtimeConnectionState,
  type RealtimeEventDto,
  realtimeEventDtoSchema,
  reportMalformedRealtimeEvent,
} from '@/services/realtime/realtime-events'
export {
  applyNoteSummaryToListCache,
  applyStatusOrReviewerToDetail,
  applyVersionCreatedToDetail,
  classifyVersionEventAgainstEditor,
  shouldInvalidateListForMembershipChange,
  type VersionEditorClassification,
} from '@/services/realtime/realtime-reconciliation'
export type {
  RealtimeTransport,
  RealtimeTransportConnectOptions,
} from '@/services/realtime/realtime-transport'
