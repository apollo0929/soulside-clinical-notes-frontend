import { useSyncExternalStore } from 'react'

import {
  type ActorIdentity,
  getActorIdentity,
  subscribeActorIdentity,
} from '@/services/api/actor-provider'

/**
 * Reactive development actor identity. Re-renders when setActorIdentity /
 * resetActorIdentity updates the shared actor (e.g. browser console switches).
 */
export function useActorIdentity(): ActorIdentity {
  return useSyncExternalStore(subscribeActorIdentity, getActorIdentity, getActorIdentity)
}
