import { setupServer } from 'msw/node'

import { createMockBackendHandlers } from '@/mock/msw/handlers'
import { MockBackendService } from '@/mock/services/backend'

/**
 * Node MSW server for integration tests.
 * Prefer creating a fresh backend+server per test file to avoid shared state.
 */
export function createMockBackendNodeServer(
  backend: MockBackendService = new MockBackendService({ autoSeed: false }),
) {
  const server = setupServer(...createMockBackendHandlers(backend))
  return { backend, server }
}
