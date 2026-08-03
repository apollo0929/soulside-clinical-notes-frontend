import type { UnhandledRequestStrategy } from 'msw'

type UnhandledRequestPrint = {
  readonly warning: () => void
  readonly error: () => void
}

/**
 * Development MSW policy for requests with no matching handler.
 *
 * - Document/navigation and Vite toolchain requests: silent bypass (never treat as API).
 * - Unhandled `/api/*`: report as an error so missing handlers are visible.
 * - Everything else (favicon, source maps, static): silent bypass.
 */
export function handleDevUnhandledRequest(request: Request, print: UnhandledRequestPrint): void {
  const url = new URL(request.url)

  if (shouldSilentlyBypassUnhandledRequest(request, url)) {
    return
  }

  if (url.pathname.startsWith('/api/')) {
    print.error()
    return
  }
}

export function shouldSilentlyBypassUnhandledRequest(
  request: Request,
  url: URL = new URL(request.url),
): boolean {
  if (request.mode === 'navigate' || request.destination === 'document') {
    return true
  }

  const { pathname } = url
  if (
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/@id/') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/src/') ||
    pathname === '/favicon.ico' ||
    pathname.endsWith('.map')
  ) {
    return true
  }

  return false
}

export function createDevUnhandledRequestHandler(): UnhandledRequestStrategy {
  const handler: UnhandledRequestStrategy = (request, print) => {
    handleDevUnhandledRequest(request, print)
  }
  return handler
}
