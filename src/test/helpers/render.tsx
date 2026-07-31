import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { ErrorBoundary } from '@/app/ErrorBoundary'
import { createTestQueryClient, registerTestQueryClient } from '@/test/helpers/queryClient'

type ProvidersOptions = {
  route?: string
  queryClient?: QueryClient
}

function AllProviders({
  children,
  route,
  queryClient,
}: {
  children: ReactNode
  route: string
  queryClient: QueryClient
}) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

type CustomRenderOptions = Omit<RenderOptions, 'wrapper'> & ProvidersOptions

type RenderWithProvidersResult = RenderResult & {
  queryClient: QueryClient
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient, ...options }: CustomRenderOptions = {},
): RenderWithProvidersResult {
  const client = queryClient ? registerTestQueryClient(queryClient) : createTestQueryClient()

  const result = render(ui, {
    wrapper: ({ children }) => (
      <AllProviders route={route} queryClient={client}>
        {children}
      </AllProviders>
    ),
    ...options,
  })

  return {
    ...result,
    queryClient: client,
  }
}

export * from '@testing-library/react'
