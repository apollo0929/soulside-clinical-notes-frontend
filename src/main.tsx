import './index.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'

async function bootstrap(): Promise<void> {
  if (import.meta.env.DEV) {
    const { ensureDevMockBackend } = await import('@/services/api/dev-bootstrap')
    await ensureDevMockBackend()
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
