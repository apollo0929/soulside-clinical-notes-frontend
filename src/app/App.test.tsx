import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppShell } from '@/app/AppShell'
import { appChildRoutes } from '@/app/routes'
import { createTestQueryClient } from '@/test/helpers/queryClient'

describe('application smoke', () => {
  it('renders the home shell', () => {
    const queryClient = createTestQueryClient()
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <AppShell />,
          children: appChildRoutes,
        },
      ],
      { initialEntries: ['/'] },
    )

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Soulside Clinical Notes' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/application shell is running/i)).toBeInTheDocument()
  })
})
