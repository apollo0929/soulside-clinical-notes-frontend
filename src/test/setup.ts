import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

import { clearTestQueryClients } from '@/test/helpers/queryClient'

afterEach(() => {
  cleanup()
  clearTestQueryClients()
})
