import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import type { NoteDetailAggregate } from '@/domain/models/note-detail-aggregate'
import { NoteDetailPage } from '@/features/note-detail/NoteDetailPage'
import { notesKeys } from '@/features/notes-list/notes-query-keys'
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

describe('SoapEditor UI', () => {
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
    vi.restoreAllMocks()
  })

  afterAll(() => {
    server.close()
  })

  function editableNoteId(): string {
    const note = backend.database.listNotes().find((item) => item.status === 'IN_REVIEW')
    expect(note).toBeDefined()
    return note!.id
  }

  function renderEditorRoute(noteId: string, fromList = '/notes?status=IN_REVIEW') {
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
      { initialEntries: [{ pathname: `/notes/${noteId}`, state: { fromList } }] },
    )
    const view = render(<RouterProvider router={router} />)
    return { ...view, router, queryClient: client }
  }

  async function openEditor(noteId: string) {
    const result = renderEditorRoute(noteId)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit note' })).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'SOAP content' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    await waitFor(() => {
      expect(screen.getByTestId('soap-editor')).toBeInTheDocument()
    })
    return result
  }

  it('42–47: read-only first; Edit note opens four labelled textareas with content', async () => {
    const noteId = editableNoteId()
    const note = backend.database.getNote(parseNoteId(noteId))!
    const version = backend.database.getVersion(note.currentVersionId)!
    await openEditor(noteId)
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByLabelText('Subjective')).toHaveValue(version.content.subjective)
    expect(screen.getByLabelText('Objective')).toHaveValue(version.content.objective)
    expect(screen.getByLabelText('Assessment')).toHaveValue(version.content.assessment)
    expect(screen.getByLabelText('Plan')).toHaveValue(version.content.plan)
    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent('No local changes')
  })

  it('44: non-editable note shows read-only reason without Edit note', async () => {
    const approved = backend.database.listNotes().find((item) => item.status === 'APPROVED')
    expect(approved).toBeDefined()
    renderEditorRoute(approved!.id)
    await waitFor(() => {
      expect(screen.getByText(/Editing unavailable:/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Edit note' })).not.toBeInTheDocument()
  })

  it('48–53: independent dirty indicators, reset section, and summary', async () => {
    const noteId = editableNoteId()
    const note = backend.database.getNote(parseNoteId(noteId))!
    const version = backend.database.getVersion(note.currentVersionId)!
    await openEditor(noteId)

    fireEvent.change(screen.getByLabelText('Subjective'), {
      target: { value: `${version.content.subjective} edited` },
    })
    expect(document.getElementById('soap-editor-subjective-status')).toHaveTextContent('Modified')
    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent('1 unsaved section')

    fireEvent.change(screen.getByLabelText('Plan'), {
      target: { value: `${version.content.plan} plan` },
    })
    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent('2 unsaved sections')

    fireEvent.change(screen.getByLabelText('Subjective'), {
      target: { value: version.content.subjective },
    })
    expect(document.getElementById('soap-editor-subjective-status')).toHaveTextContent('Saved')
    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent('1 unsaved section')

    fireEvent.change(screen.getByLabelText('Objective'), {
      target: { value: 'temporary objective' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Reset Objective to saved content' }))
    expect(screen.getByLabelText('Objective')).toHaveValue(version.content.objective)
    expect(screen.getByLabelText('Plan')).toHaveValue(`${version.content.plan} plan`)
  })

  it('54–59: discard confirmation, stay, discard exit, and focus return', async () => {
    const noteId = editableNoteId()
    await openEditor(noteId)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    // Single discard/cancel control — no redundant second discard button.
    expect(screen.queryByRole('button', { name: 'Discard all changes' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Subjective'), { target: { value: 'dirty' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/unsaved SOAP edits will be discarded/i)).toBeInTheDocument()
    expect(dialog.textContent).not.toMatch(/dirty/)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay and continue editing' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Subjective')).toHaveValue('dirty')

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Discard and exit edit mode' }))
    await waitFor(() => {
      expect(screen.queryByTestId('soap-editor')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Edit note' })).toHaveFocus()
  })

  it('60–63: historical versions stay read-only; no save request or cache mutation', async () => {
    const noteId = editableNoteId()
    const { queryClient } = await openEditor(noteId)
    const detailKey = notesKeys.detail(parseNoteId(noteId))
    const before = queryClient.getQueryData(detailKey)

    const posts: string[] = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST') {
        posts.push(new URL(request.url).pathname)
      }
    })

    fireEvent.change(screen.getByLabelText('Assessment'), { target: { value: 'local only' } })
    expect(posts.filter((path) => path.includes('/versions'))).toHaveLength(0)
    expect(queryClient.getQueryData(detailKey)).toBe(before)
    expect(screen.getByText(/current version only/i)).toBeInTheDocument()
  })

  it('64–67: beforeunload only while dirty; cleaned on revert and unmount', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const noteId = editableNoteId()
    const note = backend.database.getNote(parseNoteId(noteId))!
    const version = backend.database.getVersion(note.currentVersionId)!
    const { unmount } = await openEditor(noteId)

    const beforeUnloadAdds = () =>
      addSpy.mock.calls.filter((call) => call[0] === 'beforeunload').length

    const baseline = beforeUnloadAdds()
    fireEvent.change(screen.getByLabelText('Subjective'), { target: { value: 'x' } })
    expect(beforeUnloadAdds()).toBeGreaterThan(baseline)

    fireEvent.change(screen.getByLabelText('Subjective'), {
      target: { value: version.content.subjective },
    })
    await waitFor(() => {
      expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent('No local changes')
    })
    expect(removeSpy.mock.calls.some((call) => call[0] === 'beforeunload')).toBe(true)

    fireEvent.change(screen.getByLabelText('Subjective'), { target: { value: 'again' } })
    unmount()
    expect(removeSpy.mock.calls.some((call) => call[0] === 'beforeunload')).toBe(true)
  })

  it('68–74: internal navigation blocked; stay/leave; no clinical text in dialog', async () => {
    const noteId = editableNoteId()
    const { router } = await openEditor(noteId)
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'secret clinical plan' } })

    await router.navigate('/notes')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Leave without saving/i)).toBeInTheDocument()
    expect(dialog.textContent).not.toContain('secret clinical plan')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay and continue editing' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(screen.getByLabelText('Plan')).toHaveValue('secret clinical plan')
    expect(screen.queryByTestId('notes-list-restored')).not.toBeInTheDocument()

    await router.navigate('/notes')
    fireEvent.click(await screen.findByRole('button', { name: 'Discard and leave' }))
    await waitFor(() => {
      expect(screen.getByTestId('notes-list-restored')).toBeInTheDocument()
    })
  })

  it('75–79: dirty editor preserves draft and warns when head changes', async () => {
    const noteId = editableNoteId()
    const { queryClient } = await openEditor(noteId)
    const detailKey = notesKeys.detail(parseNoteId(noteId))
    const current = queryClient.getQueryData(detailKey) as NoteDetailAggregate
    expect(current).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Subjective'), { target: { value: 'kept draft' } })

    const newerId = parseVersionId(`${String(current.currentVersion.id)}_newer`)
    queryClient.setQueryData(detailKey, {
      ...current,
      note: { ...current.note, currentVersionId: newerId },
      currentVersion: {
        ...current.currentVersion,
        id: newerId,
        revisionNumber: current.currentVersion.revisionNumber + 1,
        content: {
          ...current.currentVersion.content,
          subjective: 'server newer',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByText(/newer version of this note is available/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Subjective')).toHaveValue('kept draft')
    expect(document.querySelector('.soap-editor__base-version')).toHaveTextContent(
      `Editing base revision ${current.currentVersion.revisionNumber} (${String(current.currentVersion.id)})`,
    )
  })

  it('clean head change reinitializes reducer without requiring a keystroke', async () => {
    const noteId = editableNoteId()
    const { queryClient } = await openEditor(noteId)
    const detailKey = notesKeys.detail(parseNoteId(noteId))
    const current = queryClient.getQueryData(detailKey) as NoteDetailAggregate
    expect(current).toBeTruthy()

    const newerId = parseVersionId(`${String(current.currentVersion.id)}_newer_clean`)
    queryClient.setQueryData(detailKey, {
      ...current,
      note: { ...current.note, currentVersionId: newerId },
      currentVersion: {
        ...current.currentVersion,
        id: newerId,
        revisionNumber: current.currentVersion.revisionNumber + 1,
        content: {
          ...current.currentVersion.content,
          subjective: 'server newer clean',
        },
      },
    })

    await waitFor(() => {
      expect(screen.getByLabelText('Subjective')).toHaveValue('server newer clean')
    })
    expect(screen.queryByText(/newer version of this note is available/i)).not.toBeInTheDocument()
    expect(screen.getByTestId('soap-editor-save-label')).toHaveTextContent('No local changes')
    expect(
      screen.getByText(
        new RegExp(`Editing base revision ${current.currentVersion.revisionNumber + 1}`),
      ),
    ).toBeInTheDocument()
  })

  it('discard dialog yields to a single navigation confirmation', async () => {
    const noteId = editableNoteId()
    const { router } = await openEditor(noteId)
    fireEvent.change(screen.getByLabelText('Subjective'), { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()

    await router.navigate('/notes')
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveTextContent(/Leave without saving/i)
    })
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.queryByText(/Discard unsaved changes/i)).not.toBeInTheDocument()
  })

  it('80–89: accessibility labels and non-assertive dirty summary', async () => {
    const noteId = editableNoteId()
    await openEditor(noteId)
    expect(screen.getByTestId('soap-editor')).toHaveAccessibleName(/Edit SOAP content/i)
    expect(screen.getByLabelText('Subjective')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset Subjective to saved content' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Subjective'), { target: { value: 'a' } })
    expect(document.getElementById('soap-editor-subjective-status')).toHaveTextContent('Modified')
    const label = screen.getByTestId('soap-editor-save-label')
    expect(label.closest('[aria-live="assertive"]')).toBeNull()
  })
})
