import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'

const DEV_BACKEND_BOOTSTRAP_TIMEOUT_MS = 4_000

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    try {
      const { ensureDevMockBackend } = await import('@/services/api/dev-bootstrap')
      await Promise.race([
        ensureDevMockBackend(),
        new Promise<void>((resolve) => {
          globalThis.setTimeout(resolve, DEV_BACKEND_BOOTSTRAP_TIMEOUT_MS)
        }),
      ])
    } catch (error) {
      // Offline / aborted seed must not block shell render — IndexedDB cache may still hydrate.
      console.warn(
        'Development mock backend bootstrap failed; continuing with shell render.',
        error,
      )
    }
  }

  const rootElement = document.getElementById('root')
  if (!rootElement) {
    throw new Error('Root element "#root" was not found')
  }

  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
