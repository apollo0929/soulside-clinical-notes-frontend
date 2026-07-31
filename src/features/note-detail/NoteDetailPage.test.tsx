import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { NoteDetailPage } from '@/features/note-detail/NoteDetailPage'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { resetActorIdentity } from '@/services/api/actor-provider'
import { createTestQueryClient } from '@/test/helpers/queryClient'

describe('NoteDetailPage', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 60 })
    resetActorIdentity()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
  })

  function renderDetail(noteId: string, fromList = '/notes?status=FAILED') {
    const client = createTestQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[{ pathname: `/notes/${noteId}`, state: { fromList } }]}>
          <Routes>
            <Route path="/notes/:noteId" element={children} />
            <Route path="/notes" element={<p>List restored</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    return render(<NoteDetailPage />, { wrapper })
  }

  it('38–43: loading then header, SOAP, and version history', async () => {
    const note = backend.database.listNotes()[0]!
    renderDetail(note.id)
    expect(screen.getByText(/loading note detail/i)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'SOAP content' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Subjective' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Objective' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Assessment' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Version history' })).toBeInTheDocument()
    expect(screen.getByText(/\(current\)/)).toBeInTheDocument()
  })

  it('47–51: timeline, back link preserves list URL, invalid route', async () => {
    const note = backend.database.listNotes()[0]!
    renderDetail(note.id, '/notes?status=APPROVED')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review timeline' })).toBeInTheDocument()
    })
    const back = screen.getAllByRole('link', { name: 'Back to notes' })[0]!
    expect(back).toHaveAttribute('href', '/notes?status=APPROVED')

    const client = createTestQueryClient()
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/notes/%20']}>
          <Routes>
            <Route path="/notes/:noteId" element={<NoteDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Invalid note link' })).toBeInTheDocument()
  })

  it('52: not-found state is distinct', async () => {
    renderDetail('note_missing_zzz_999')
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Note not found' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'Permission denied' })).not.toBeInTheDocument()
  })

  it('forbidden state is distinct from not found', async () => {
    const { http, HttpResponse } = await import('msw')
    server.use(
      http.get('*/api/notes/:id', () =>
        HttpResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Denied for test.', details: null } },
          { status: 403 },
        ),
      ),
    )
    const note = backend.database.listNotes()[0]!
    renderDetail(note.id)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Permission denied' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { name: 'Note not found' })).not.toBeInTheDocument()
  })

  it('note change clears prior version selection before next detail settles', async () => {
    const notes = backend.database
      .listNotes()
      .filter((n) => backend.database.listVersionsForNote(n.id).length >= 2)
    expect(notes.length).toBeGreaterThanOrEqual(2)
    const first = notes[0]!
    const second = notes[1]!
    const firstParent = backend.database.getVersion(first.currentVersionId)?.parentVersionId
    expect(firstParent).toBeTruthy()

    const { createMemoryRouter, RouterProvider } = await import('react-router-dom')
    const client = createTestQueryClient()
    const router = createMemoryRouter([{ path: '/notes/:noteId', element: <NoteDetailPage /> }], {
      initialEntries: [`/notes/${first.id}`],
    })

    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Version history' })).toBeInTheDocument()
    })

    const versionRequests: string[] = []
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url)
      if (url.pathname.includes('/versions/')) {
        versionRequests.push(`${url.pathname}`)
      }
    })

    await router.navigate(`/notes/${second.id}`)

    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Version history' })).toBeInTheDocument()
      expect(screen.queryByText(String(first.id))).not.toBeInTheDocument()
    })

    expect(
      versionRequests.some(
        (path) =>
          path.includes(`/api/notes/${second.id}/versions/`) && path.includes(String(firstParent)),
      ),
    ).toBe(false)
  })

  it('55–57: LOCKED presentation and lifecycle actions without execution', async () => {
    const locked = backend.database.listNotes().find((n) => n.status === 'LOCKED')
    expect(locked).toBeDefined()
    renderDetail(locked!.id)
    await waitFor(() => {
      expect(screen.getByText(/this note is locked/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { name: 'Available actions' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
  })

  it('44–46: selecting two versions shows accessible diff legend when possible', async () => {
    const note = backend.database
      .listNotes()
      .find((n) => backend.database.listVersionsForNote(n.id).length >= 2)
    expect(note).toBeDefined()
    renderDetail(note!.id)
    await waitFor(() => {
      expect(screen.getByRole('navigation', { name: 'Version history' })).toBeInTheDocument()
    })
    const history = screen.getByRole('navigation', { name: 'Version history' })
    const baseRadios = within(history).getAllByRole('radio', { name: /Base, revision/ })
    const compareRadios = within(history).getAllByRole('radio', { name: /Compare, revision/ })
    expect(baseRadios.length).toBeGreaterThanOrEqual(2)
    fireEvent.click(baseRadios[1]!)
    fireEvent.click(compareRadios[0]!)
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Diff legend' })).toBeInTheDocument()
    })
  })
})
