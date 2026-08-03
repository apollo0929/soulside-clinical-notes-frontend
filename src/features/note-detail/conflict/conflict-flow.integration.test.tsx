import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { parseClientMutationId, parseNoteId, parseUserId } from '@/domain/ids'
import { mapSoapContentToDto } from '@/domain/mappers/soap'
import { NoteDetailPage } from '@/features/note-detail/NoteDetailPage'
import { isMockApiError } from '@/mock/errors'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import {
  DEFAULT_DEV_ADMIN_ACTOR,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { createTestQueryClient } from '@/test/helpers/queryClient'

function installDialogPolyfill() {
  if (typeof HTMLDialogElement === 'undefined') {
    return
  }
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '')
    }
  }
  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open')
    }
  }
}

describe('Conflict resolution integration', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    installDialogPolyfill()
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 60 })
    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
  })

  afterEach(() => {
    server.resetHandlers()
    resetActorIdentity()
  })

  afterAll(() => {
    server.close()
  })

  function editableNoteId(): string {
    const note = backend.database.listNotes().find((item) => item.status === 'IN_REVIEW')
    expect(note).toBeDefined()
    return note!.id
  }

  function renderDetail(noteId: string) {
    const client = createTestQueryClient()
    const router = createMemoryRouter(
      [
        {
          path: '/notes/:noteId',
          element: (
            <QueryClientProvider client={client}>
              <NoteDetailPage />
            </QueryClientProvider>
          ),
        },
        {
          path: '/notes',
          element: (
            <QueryClientProvider client={client}>
              <p data-testid="notes-list-restored">Notes list</p>
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: [{ pathname: `/notes/${noteId}`, state: { fromList: '/notes' } }] },
    )
    return { ...render(<RouterProvider router={router} />), router, queryClient: client }
  }

  it('100–110: MSW conflict → resolve Keep mine / Use server / Manual → clean editor', async () => {
    const noteId = editableNoteId()
    const note = backend.database.getNote(parseNoteId(noteId))!
    const baseVersion = backend.database.getVersion(note.currentVersionId)!
    const ancestorContent = baseVersion.content

    renderDetail(noteId)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit note' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    await waitFor(() => {
      expect(screen.getByTestId('soap-editor')).toBeInTheDocument()
    })

    // Advance server head while the editor still holds the prior base (cache not updated).
    const concurrent = await backend.createVersion({
      actor: {
        userId: parseUserId(DEFAULT_DEV_ADMIN_ACTOR.userId),
        role: DEFAULT_DEV_ADMIN_ACTOR.role,
      },
      noteId: note.id,
      baseVersionId: baseVersion.id,
      content: mapSoapContentToDto({
        subjective: `${ancestorContent.subjective} server-S`,
        objective: `${ancestorContent.objective} server-O`,
        assessment: `${ancestorContent.assessment} server-A`,
        plan: ancestorContent.plan,
      }),
      clientMutationId: parseClientMutationId('mut_concurrent_server'),
      occurredAt: backend.clock.now(),
    })
    expect(isMockApiError(concurrent)).toBe(false)

    const subjective = screen.getByRole('textbox', { name: 'Subjective' })
    const objective = screen.getByRole('textbox', { name: 'Objective' })
    const assessment = screen.getByRole('textbox', { name: 'Assessment' })
    const plan = screen.getByRole('textbox', { name: 'Plan' })

    const localSubjective = `${ancestorContent.subjective} local-S`
    const localObjective = `${ancestorContent.objective} local-O`
    const localAssessment = `${ancestorContent.assessment} local-A`
    fireEvent.change(subjective, { target: { value: localSubjective } })
    fireEvent.change(objective, { target: { value: localObjective } })
    fireEvent.change(assessment, { target: { value: localAssessment } })

    await waitFor(
      () => {
        expect(
          screen.getByRole('heading', { name: /Version conflict — resolve before continuing/i }),
        ).toBeInTheDocument()
      },
      { timeout: 8_000 },
    )

    expect(subjective).toHaveValue(localSubjective)
    expect((subjective as HTMLTextAreaElement).readOnly).toBe(true)
    expect(screen.getAllByText(/local edits have been preserved/i).length).toBeGreaterThan(0)

    const subjectiveChoices = screen.getByRole('group', {
      name: /How should Subjective be resolved/i,
    })
    const objectiveChoices = screen.getByRole('group', {
      name: /How should Objective be resolved/i,
    })
    const assessmentChoices = screen.getByRole('group', {
      name: /How should Assessment be resolved/i,
    })

    fireEvent.click(within(subjectiveChoices).getByRole('radio', { name: 'Keep mine' }))
    fireEvent.click(within(objectiveChoices).getByRole('radio', { name: 'Use server' }))
    fireEvent.click(within(assessmentChoices).getByRole('radio', { name: 'Manual merge' }))
    const manual = screen.getByLabelText(/Manual Assessment text/i)
    fireEvent.change(manual, { target: { value: 'manual-A' } })

    const resolveButton = screen.getByRole('button', { name: 'Resolve and save' })
    await waitFor(() => {
      expect(resolveButton).toBeEnabled()
    })
    fireEvent.click(resolveButton)

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /Version conflict — resolve before continuing/i }),
      ).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent(/No local changes|Saved/)
    expect(subjective).toHaveValue(localSubjective)
    expect(objective).toHaveValue(`${ancestorContent.objective} server-O`)
    expect(assessment).toHaveValue('manual-A')
    expect(plan).toHaveValue(ancestorContent.plan)
    expect((subjective as HTMLTextAreaElement).readOnly).toBe(false)
  }, 15_000)
})
