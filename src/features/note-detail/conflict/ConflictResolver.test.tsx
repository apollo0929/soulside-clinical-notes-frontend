import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import {
  conflictResolutionReducer,
  createInitialConflictResolutionState,
} from '@/features/note-detail/conflict/conflict-resolution.reducer'
import {
  getUnresolvedConflictCount,
  isConflictSessionResolved,
} from '@/features/note-detail/conflict/conflict-selectors'
import { buildConflictResolutionSession } from '@/features/note-detail/conflict/conflict-session'
import { ConflictResolver } from '@/features/note-detail/conflict/ConflictResolver'
import type { UseConflictResolutionResult } from '@/features/note-detail/conflict/use-conflict-resolution'
import { buildSoapContent } from '@/test/fixtures/domain'

function buildSession() {
  return buildConflictResolutionSession({
    noteId: parseNoteId('note_c1'),
    localBaseVersionId: parseVersionId('ver_5'),
    serverHeadVersionId: parseVersionId('ver_7'),
    serverHeadRevision: 7,
    commonAncestorVersionId: parseVersionId('ver_4'),
    commonAncestorRevision: 4,
    ancestorContent: buildSoapContent({
      subjective: 'aS',
      objective: 'aO',
      assessment: 'aA',
      plan: 'aP',
    }),
    localContent: buildSoapContent({
      subjective: 'local-S',
      objective: 'local-O',
      assessment: 'aA',
      plan: 'local-P',
    }),
    serverContent: buildSoapContent({
      subjective: 'server-S',
      objective: 'server-O',
      assessment: 'aA',
      plan: 'aP',
    }),
  })
}

function createResult(
  overrides: Partial<UseConflictResolutionResult> = {},
): UseConflictResolutionResult {
  const session = buildSession()
  const resolution = overrides.resolution ?? createInitialConflictResolutionState(session)
  return {
    hydration: { kind: 'ready', session },
    resolution,
    dispatch: vi.fn(),
    unresolvedCount: getUnresolvedConflictCount(resolution),
    canSubmit: isConflictSessionResolved(resolution),
    saveStatus: { kind: 'idle' },
    submit: vi.fn(),
    retrySave: vi.fn(),
    session,
    ...overrides,
  }
}

describe('ConflictResolver UI', () => {
  it('45–56, 92–95: preserves message, revisions, sections, choices, disabled reason', () => {
    const session = buildSession()
    let resolution = createInitialConflictResolutionState(session)
    const dispatch = vi.fn((action: Parameters<typeof conflictResolutionReducer>[1]) => {
      resolution = conflictResolutionReducer(resolution, action)
    })
    const submit = vi.fn()

    const { rerender } = render(
      <ConflictResolver
        conflictResolution={createResult({
          resolution,
          dispatch,
          unresolvedCount: 2,
          canSubmit: false,
          submit,
          session,
        })}
        onContinueReviewing={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('heading', { name: /Version conflict — resolve before continuing/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/local edits have been preserved/i)).toBeInTheDocument()
    expect(screen.getByText('Server head revision')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('Common ancestor revision')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Subjective/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Objective/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Assessment/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Plan/ })).toBeInTheDocument()
    expect(screen.getByText(/Automatic — kept your local edit/i)).toBeInTheDocument()

    const subjective = screen.getByRole('group', { name: /How should Subjective be resolved/i })
    expect(within(subjective).getByRole('radio', { name: 'Keep mine' })).toBeInTheDocument()
    expect(within(subjective).getByRole('radio', { name: 'Use server' })).toBeInTheDocument()
    expect(within(subjective).getByRole('radio', { name: 'Manual merge' })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Resolve and save' })).toBeDisabled()
    expect(screen.getAllByText(/still need a choice/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Added:/i).length).toBeGreaterThan(0)

    fireEvent.click(within(subjective).getByRole('radio', { name: 'Keep mine' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'CHOOSE_LOCAL', section: 'subjective' })

    resolution = conflictResolutionReducer(resolution, {
      type: 'CHOOSE_LOCAL',
      section: 'subjective',
    })
    resolution = conflictResolutionReducer(resolution, {
      type: 'CHOOSE_SERVER',
      section: 'objective',
    })

    rerender(
      <ConflictResolver
        conflictResolution={createResult({
          resolution,
          dispatch,
          unresolvedCount: 0,
          canSubmit: true,
          submit,
          session,
        })}
        onContinueReviewing={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: 'Resolve and save' })).toBeEnabled()
    expect(screen.getAllByText(/Current choice:/i).length).toBeGreaterThan(0)
  })

  it('52–53: manual merge textarea accepts empty string', () => {
    const session = buildSession()
    let resolution = createInitialConflictResolutionState(session)
    resolution = conflictResolutionReducer(resolution, {
      type: 'CHOOSE_MANUAL',
      section: 'subjective',
    })
    const dispatch = vi.fn()

    render(
      <ConflictResolver
        conflictResolution={createResult({
          resolution,
          dispatch,
          unresolvedCount: 1,
          canSubmit: false,
          session,
        })}
        onContinueReviewing={vi.fn()}
      />,
    )

    const textarea = screen.getByLabelText(/Manual Subjective text/i)
    expect(textarea).toHaveValue('local-S')
    fireEvent.change(textarea, { target: { value: '' } })
    expect(dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_MANUAL_VALUE',
      section: 'subjective',
      value: '',
    })
  })

  it('60: clinical content is not placed in aria-live', () => {
    render(<ConflictResolver conflictResolution={createResult()} onContinueReviewing={vi.fn()} />)
    const live = document.querySelector('[aria-live]')
    expect(live?.textContent ?? '').not.toMatch(/local-S|server-S/)
  })

  it('99: does not introduce an extra page h1', () => {
    render(<ConflictResolver conflictResolution={createResult()} onContinueReviewing={vi.fn()} />)
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument()
  })

  it('55: hydration error exposes a visible disabled Resolve reason', () => {
    render(
      <ConflictResolver
        conflictResolution={createResult({
          hydration: {
            kind: 'error',
            message: 'Ancestor missing',
            retryable: true,
            retry: vi.fn(),
          },
          session: null,
          resolution: null,
          canSubmit: false,
          unresolvedCount: 0,
        })}
        onContinueReviewing={vi.fn()}
      />,
    )
    expect(screen.getByText('Ancestor missing')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Resolve and save' })).toBeDisabled()
    expect(screen.getByText(/Conflict versions could not be loaded/i)).toBeInTheDocument()
  })
})
