import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

import { AppShell } from '@/app/AppShell'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { appChildRoutes } from '@/app/routes'

function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}

function createAppRouter() {
  return createBrowserRouter([
    {
      path: '/',
      element: <AppShell />,
      children: appChildRoutes,
    },
  ])
}

export function App() {
  const [queryClient] = useState(createAppQueryClient)
  const [router] = useState(createAppRouter)

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
