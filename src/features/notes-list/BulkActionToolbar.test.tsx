import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BulkActionToolbar } from '@/features/notes-list/BulkActionToolbar'
import { render } from '@/test/helpers/render'

const reviewerOptions = [
  { id: 'usr_reviewer_42_0', label: 'Reviewer Zero' },
  { id: 'usr_reviewer_42_1', label: 'Reviewer One' },
] as const

function renderToolbar(overrides: Partial<Parameters<typeof BulkActionToolbar>[0]> = {}) {
  const props = {
    selectedCount: 3,
    reviewerOptions,
    selectedReviewerId: '',
    onReviewerChange: vi.fn(),
    onAssign: vi.fn(),
    onRegenerate: vi.fn(),
    onClearSelection: vi.fn(),
    isAssignPending: false,
    isRegeneratePending: false,
    assignDisabledReason: 'Select a reviewer before assigning.',
    regenerateDisabledReason: null,
    resultAnnouncement: null,
    errorMessage: null,
    ...overrides,
  }
  return { ...render(<BulkActionToolbar {...props} />), props }
}

describe('BulkActionToolbar', () => {
  it('renders accessible labels and selected count', () => {
    renderToolbar({ selectedCount: 3 })

    expect(screen.getByRole('heading', { name: 'Bulk actions' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()
    expect(screen.getByLabelText('Assign to reviewer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assign reviewer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request regeneration' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('3 notes selected')
  })

  it('uses singular copy for one selected note', () => {
    renderToolbar({
      selectedCount: 1,
      assignDisabledReason: null,
      selectedReviewerId: reviewerOptions[0].id,
    })
    expect(screen.getByRole('status')).toHaveTextContent('1 note selected')
  })

  it('disables assign without a reviewer and exposes the reason', () => {
    const { props } = renderToolbar({
      selectedReviewerId: '',
      assignDisabledReason: 'Select a reviewer before assigning.',
    })

    const assignButton = screen.getByRole('button', { name: 'Assign reviewer' })
    expect(assignButton).toBeDisabled()
    expect(assignButton).toHaveAttribute('aria-disabled', 'true')
    expect(assignButton).toHaveAttribute('title', 'Select a reviewer before assigning.')
    expect(screen.getByText('Select a reviewer before assigning.')).toHaveAttribute(
      'id',
      'bulk-assign-reason',
    )
    expect(assignButton).toHaveAttribute('aria-describedby', 'bulk-assign-reason')

    fireEvent.click(assignButton)
    expect(props.onAssign).not.toHaveBeenCalled()
  })

  it('enables assign when a reviewer is selected and no disable reason', () => {
    const { props } = renderToolbar({
      selectedReviewerId: reviewerOptions[0].id,
      assignDisabledReason: null,
    })

    const assignButton = screen.getByRole('button', { name: 'Assign reviewer' })
    expect(assignButton).toBeEnabled()
    fireEvent.click(assignButton)
    expect(props.onAssign).toHaveBeenCalledTimes(1)
  })

  it('notifies reviewer changes from the select control', () => {
    const { props } = renderToolbar()
    fireEvent.change(screen.getByLabelText('Assign to reviewer'), {
      target: { value: reviewerOptions[1].id },
    })
    expect(props.onReviewerChange).toHaveBeenCalledWith(reviewerOptions[1].id)
  })
})
