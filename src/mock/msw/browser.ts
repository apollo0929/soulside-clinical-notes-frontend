import { setupWorker } from 'msw/browser'

import { createMockBackendHandlers } from '@/mock/msw/handlers'
import { MockBackendService } from '@/mock/services/backend'

/**
 * Browser MSW worker for local app simulation.
 * Call start() from app bootstrap when enabling the dummy backend.
 */
export function createMockBackendBrowserWorker(
  backend: MockBackendService = new MockBackendService(),
) {
  return {
    backend,
    worker: setupWorker(...createMockBackendHandlers(backend)),
  }
}
