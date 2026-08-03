import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { resetConnectivityServiceForTests } from '@/services/offline/connectivity'
import { resetOfflineBootstrapForTests } from '@/services/offline/offline-bootstrap'
import { clearOfflineDatabaseContents } from '@/services/offline/offline-db'
import { resetRealtimeBootstrapForTests } from '@/services/realtime/realtime-bootstrap'
import { resetTelemetryBootstrapForTests } from '@/services/telemetry/telemetry-bootstrap'
import { clearTestQueryClients } from '@/test/helpers/queryClient'

afterEach(async () => {
  cleanup()
  clearTestQueryClients()
  resetTelemetryBootstrapForTests()
  resetRealtimeBootstrapForTests()
  resetOfflineBootstrapForTests()
  resetConnectivityServiceForTests()
  // Clear tables without closing/deleting the DB — closing races in-flight Dexie ops
  // from OfflineBootstrap / detail persist helpers across the suite.
  try {
    await clearOfflineDatabaseContents()
  } catch {
    // DB may not be open yet in suites that never touched offline storage.
  }
})
