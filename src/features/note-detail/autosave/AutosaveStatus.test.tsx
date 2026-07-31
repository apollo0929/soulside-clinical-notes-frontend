import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { parseUserId, parseVersionId } from '@/domain/ids'
import type { AutosaveStatus } from '@/features/note-detail/autosave/autosave.types'
import { autosaveStatusLabel } from '@/features/note-detail/autosave/autosave-status'
import { AutosaveStatusBanner } from '@/features/note-detail/autosave/AutosaveStatus'

describe('AutosaveStatusBanner', () => {
  it('81–89: labels, aria-live polite, retry only when retryable, conflict message', () => {
    const statuses: AutosaveStatus[] = [
      { kind: 'CLEAN' },
      { kind: 'DEBOUNCING' },
      { kind: 'SAVING', mutationId: 'mut_1' as never },
      { kind: 'QUEUED', inFlightMutationId: 'mut_1' as never },
      { kind: 'SAVED', versionId: parseVersionId('ver_1') },
    ]
    expect(autosaveStatusLabel(statuses[0]!)).toBe('No local changes')
    expect(autosaveStatusLabel(statuses[1]!)).toBe('Waiting to save…')
    expect(autosaveStatusLabel(statuses[2]!)).toBe('Saving…')
    expect(autosaveStatusLabel(statuses[3]!)).toBe('Saving latest changes after current request…')
    expect(autosaveStatusLabel(statuses[4]!)).toBe('Saved')

    const { rerender } = render(
      <AutosaveStatusBanner
        status={{
          kind: 'ERROR',
          message: 'offline',
          retryable: true,
          mutationId: 'mut_1' as never,
        }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByTestId('soap-editor-save-label')).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument()

    rerender(<AutosaveStatusBanner status={{ kind: 'DEBOUNCING' }} onRetry={vi.fn()} />)
    expect(screen.getByTestId('soap-editor-save-label')).toHaveAttribute('aria-live', 'off')

    rerender(
      <AutosaveStatusBanner
        status={{
          kind: 'ERROR',
          message: 'Denied',
          retryable: false,
          mutationId: 'mut_1' as never,
        }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Retry save' })).not.toBeInTheDocument()

    rerender(
      <AutosaveStatusBanner
        status={{
          kind: 'CONFLICT',
          conflict: {
            error: 'version_conflict',
            current: {
              id: parseVersionId('ver_2'),
              revision: 2,
              authoredBy: { id: parseUserId('usr_admin_42'), role: 'ADMIN' },
            },
            commonAncestor: { id: parseVersionId('ver_1'), revision: 1 },
          },
        }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent(
      /local edits have been preserved/i,
    )
    expect(screen.getByText('Conflict resolution required')).toBeInTheDocument()
  })
})
