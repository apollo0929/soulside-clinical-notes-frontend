import { describe, expect, it } from 'vitest'

import { AppShell } from '@/app/AppShell'
import { renderWithProviders, screen } from '@/test/helpers/render'

describe('Not Found route', () => {
  it('renders the not found page for unknown paths', () => {
    renderWithProviders(<AppShell />, { route: '/does-not-exist' })

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return home' })).toHaveAttribute('href', '/')
  })
})
