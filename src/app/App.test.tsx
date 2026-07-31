import { describe, expect, it } from 'vitest'

import { AppShell } from '@/app/AppShell'
import { renderWithProviders, screen } from '@/test/helpers/render'

describe('application smoke', () => {
  it('renders the home shell', () => {
    renderWithProviders(<AppShell />)

    expect(
      screen.getByRole('heading', { level: 1, name: 'Soulside Clinical Notes' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/application shell is running/i)).toBeInTheDocument()
  })
})
