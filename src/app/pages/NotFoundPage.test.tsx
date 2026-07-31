import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppShell } from '@/app/AppShell'
import { appChildRoutes } from '@/app/routes'
import { createTestQueryClient } from '@/test/helpers/queryClient'

describe('Not Found route', () => {
  it('renders the not found page for unknown paths', () => {
    const queryClient = createTestQueryClient()
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppShell />,
          children: appChildRoutes,
        },
      ],
      { initialEntries: ['/does-not-exist'] },
    )

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/')
  })
})
