import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { ErrorBoundary } from '@/app/ErrorBoundary'
import { createTestQueryClient, registerTestQueryClient } from '@/test/helpers/queryClient'

type ProvidersOptions = {
  route?: string
  queryClient?: QueryClient
  /** Optional location state for the initial entry (e.g. `{ fromList: '/notes?q=a' }`). */
  routeState?: unknown
}

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'> & ProvidersOptions

type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient
}

/**
 * Renders with a data memory router so `useBlocker` works in component tests.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient, routeState, ...options }: CustomRenderOptions = {},
): RenderWithProvidersResult {
  const client = queryClient ? registerTestQueryClient(queryClient) : createTestQueryClient()

  const initialEntry =
    routeState === undefined
      ? route
      : {
          pathname: route.includes('?') ? route.slice(0, route.indexOf('?')) : route,
          search: route.includes('?') ? route.slice(route.indexOf('?')) : '',
          state: routeState,
        }

  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <ErrorBoundary>
            <QueryClientProvider client={client}>{ui}</QueryClientProvider>
          </ErrorBoundary>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  )

  const result = render(<RouterProvider router={router} />, options)

  return {
    ...result,
    queryClient: client,
  }
}

export * from '@testing-library/react'
