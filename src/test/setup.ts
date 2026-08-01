import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { resetConnectivityServiceForTests } from '@/services/offline/connectivity'
import { resetOfflineBootstrapForTests } from '@/services/offline/offline-bootstrap'
import { clearOfflineDatabaseContents } from '@/services/offline/offline-db'
import { clearTestQueryClients } from '@/test/helpers/queryClient'

afterEach(async () => {
  cleanup()
  clearTestQueryClients()
  resetOfflineBootstrapForTests()
  resetConnectivityServiceForTests()
  // Clear tables without closing/deleting the DB — closing races in-flight Dexie ops
  // from OfflineBootstrap / query persist helpers across the suite.
  try {
    await clearOfflineDatabaseContents()
  } catch {
    // DB may not be open yet in suites that never touched offline storage.
  }
})
