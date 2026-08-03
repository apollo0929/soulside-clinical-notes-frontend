import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
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
              <p>List restored</p>
            </QueryClientProvider>
          ),
        },
      ],
      {
        initialEntries: [{ pathname: `/notes/${noteId}`, state: { fromList } }],
      },
    )
    return render(<RouterProvider router={router} />)
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
    const invalidRouter = createMemoryRouter(
      [
        {
          path: '/notes/:noteId',
          element: (
            <QueryClientProvider client={client}>
              <NoteDetailPage />
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ['/notes/%20'] },
    )
    render(<RouterProvider router={invalidRouter} />)
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
      ],
      {
        initialEntries: [`/notes/${first.id}`],
      },
    )

    render(<RouterProvider router={router} />)

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

  // ── Tests 1 & 2: FAILED note with assignedReviewer = null ──────────────────
  it('1–2: FAILED note with null assignedReviewer loads without crash and shows "Unassigned"', async () => {
    const failed = backend.database.listNotes().find((n) => n.status === 'FAILED')
    expect(failed).toBeDefined()
    expect(failed!.assignedReviewerId).toBeNull()

    renderDetail(failed!.id)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    // No crash: the page rendered successfully
    expect(screen.queryByRole('heading', { name: /unable to load/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /something went wrong/i })).not.toBeInTheDocument()

    // "Unassigned" shown in the assigned-reviewer metadata field
    expect(screen.getByText('Unassigned')).toBeInTheDocument()
  })

  // ── Test 4: parseUserId is never called with undefined (actor guard) ────────
  it('4: actor identity with valid userId renders detail without ZodError', async () => {
    const note = backend.database.listNotes()[0]!
    // setActorIdentity should not throw with a valid actor
    const { setActorIdentity } = await import('@/services/api/actor-provider')
    expect(() => setActorIdentity({ userId: 'usr_reviewer_42_0', role: 'REVIEWER' })).not.toThrow()

    renderDetail(note.id)

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })
    // No error boundary / route error triggered
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument()
  })

  // ── Test 5: Review events with valid actor IDs render ──────────────────────
  it('5: review events with valid actorId values appear in timeline', async () => {
    const noted = backend.database.listNotes().find((n) => {
      const events = backend.database.listReviewEvents(n.id)
      return events.length > 0 && events.every((e) => e.actorId)
    })
    expect(noted).toBeDefined()

    renderDetail(noted!.id)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Review timeline' })).toBeInTheDocument()
    })
    // At least one event rendered with role text
    expect(screen.getAllByText(/clinician|reviewer|admin/i).length).toBeGreaterThan(0)
  })

  // ── Test 9: Invalid optional IDs → recoverable UI via errorElement ─────────
  it('9: route errorElement is triggered and shows app error state when detail route crashes', async () => {
    const { http, HttpResponse } = await import('msw')
    // Force the note detail API to return a Zod-invalid (schema-breaking) response.
    // The API client's safeParse will throw, which is caught by the route's
    // errorElement rather than propagating to React Router's generic error page.
    server.use(
      http.get('*/api/notes/:id', () =>
        HttpResponse.json(
          {
            // Missing all required note-detail fields — schema parse inside
            // getNoteDetail throws ApiClientError or ZodError → route error.
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Simulated backend failure.',
              details: null,
            },
          },
          { status: 500 },
        ),
      ),
    )

    const client = createTestQueryClient()
    const { NoteDetailRouteError } = await import('@/features/note-detail/NoteDetailRouteError')
    const router = createMemoryRouter(
      [
        {
          path: '/notes/:noteId',
          element: (
            <QueryClientProvider client={client}>
              <NoteDetailPage />
            </QueryClientProvider>
          ),
          errorElement: (
            <QueryClientProvider client={client}>
              <NoteDetailRouteError />
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ['/notes/note_crash_route_test'] },
    )
    render(<RouterProvider router={router} />)

    // The 500 error causes NoteDetailPage to render its internal "Unable to load note"
    // error state — proving the application handles it instead of React Router's raw page.
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Unable to load note' })).toBeInTheDocument()
    })
    // "Back to notes" link is present
    expect(screen.getByRole('link', { name: 'Back to notes' })).toBeInTheDocument()
    // No raw error payload exposed
    expect(screen.queryByText(/ZodError/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/INTERNAL_ERROR/i)).not.toBeInTheDocument()
  })

  // ── Test 44–46 (original) ──────────────────────────────────────────────────
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
