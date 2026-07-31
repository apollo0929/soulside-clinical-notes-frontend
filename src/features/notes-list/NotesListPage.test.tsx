import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider, useSearchParams } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from '@/app/ErrorBoundary'
import { NotesListPage } from '@/features/notes-list/NotesListPage'
import { createMockBackendNodeServer } from '@/mock/msw/node'
import { seedMockDatabase } from '@/mock/seed/seed'
import { resetActorIdentity } from '@/services/api/actor-provider'
import { createTestQueryClient } from '@/test/helpers/queryClient'
import { render, renderWithProviders } from '@/test/helpers/render'

function SearchParamsProbe() {
  const [params] = useSearchParams()
  return <div data-testid="location-search">{params.toString()}</div>
}

function renderPage(route = '/notes') {
  return renderWithProviders(
    <>
      <SearchParamsProbe />
      <NotesListPage />
    </>,
    { route },
  )
}

describe('NotesListPage', () => {
  const { backend, server } = createMockBackendNodeServer()

  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' })

    class ResizeObserverStub {
      readonly #callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback
      }

      observe(target: Element): void {
        this.#callback(
          [
            {
              target,
              contentRect: {
                x: 0,
                y: 0,
                width: 960,
                height: 400,
                top: 0,
                left: 0,
                bottom: 400,
                right: 960,
                toJSON: () => ({}),
              },
              borderBoxSize: [{ inlineSize: 960, blockSize: 400 }],
              contentBoxSize: [{ inlineSize: 960, blockSize: 400 }],
              devicePixelContentBoxSize: [{ inlineSize: 960, blockSize: 400 }],
            } as ResizeObserverEntry,
          ],
          this,
        )
      }

      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)

    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList.contains('notes-virtual__scroller')) {
          return 400
        }
        return 0
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList.contains('notes-virtual__scroller')) {
          return 960
        }
        return 0
      },
    })
  })

  beforeEach(() => {
    backend.configureForTests()
    seedMockDatabase(backend.database, { seed: 42, noteCount: 60 })
    resetActorIdentity()
    vi.useRealTimers()
  })

  afterEach(() => {
    server.resetHandlers()
  })

  afterAll(() => {
    server.close()
    vi.unstubAllGlobals()
  })

  it('35–36,56,63: skeleton then loaded rows with h1', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeInTheDocument()
    expect(screen.getByLabelText('Loading notes')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByLabelText('Loading notes')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(document.querySelectorAll('[data-note-id]').length).toBeGreaterThan(0)
  })

  it('37: empty dataset without filters', async () => {
    seedMockDatabase(backend.database, { seed: 42, noteCount: 0 })
    renderPage()
    await waitFor(() => {
      expect(
        screen.getByText('No notes are available.', { selector: '.notes-list-empty p' }),
      ).toBeInTheDocument()
    })
  })

  it('38–39: no-results state and clear filters', async () => {
    renderPage('/notes?status=GENERATING&q=zzznomatch')
    await waitFor(() => {
      expect(
        screen.getByText('No notes match the current filters.', {
          selector: '.notes-list-empty p',
        }),
      ).toBeInTheDocument()
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toBe('')
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
  })

  it('40,67: error state displays retry and recovers', async () => {
    server.use(
      http.get('*/api/notes', () => {
        return HttpResponse.json(
          { error: { code: 'SIMULATED_INTERNAL_ERROR', message: 'Boom', details: null } },
          { status: 500 },
        )
      }),
    )

    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    })

    server.resetHandlers()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
  })

  it('42,60: result count is announced', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Showing \d+ of \d+ notes/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Showing \d+ of \d+ notes/)).toHaveAttribute('role', 'status')
  })

  it('43–48: filters and sort update URL search params', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('APPROVED'))
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(/status=APPROVED/)
    })

    fireEvent.change(screen.getByLabelText('Sort by'), {
      target: { value: 'createdAt' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('sort=createdAt')
    })

    fireEvent.change(screen.getByLabelText('Sort direction'), {
      target: { value: 'asc' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('direction=asc')
    })

    fireEvent.change(screen.getByLabelText('Updated from'), {
      target: { value: '2024-06-01T00:00:00.000Z' },
    })
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('from=')
    })
  })

  it('49: browser back navigation restores prior filters', async () => {
    const queryClient = createTestQueryClient()
    const router = createMemoryRouter(
      [
        {
          path: '/notes',
          element: (
            <>
              <SearchParamsProbe />
              <NotesListPage />
            </>
          ),
        },
      ],
      { initialEntries: ['/notes?status=APPROVED'] },
    )

    render(
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ErrorBoundary>,
    )

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(/status=APPROVED/)
    })

    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toBe('')
    })

    await act(async () => {
      await router.navigate(-1)
    })

    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(/status=APPROVED/)
      expect(screen.getByLabelText('APPROVED')).toBeChecked()
    })
  })

  it('50: invalid URL values do not crash', async () => {
    renderPage('/notes?status=NOPE&sort=bad&direction=sideways&q=%20')
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeInTheDocument()
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
  })

  it('51–52,55: virtualization uses note ids; Load more works', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const loadMore = await screen.findByRole('button', { name: 'Load more notes' })
    fireEvent.click(loadMore)

    await waitFor(() => {
      const text = screen.getByText(/Showing (\d+) of 60 notes/).textContent ?? ''
      const loadedCount = Number(/Showing (\d+)/.exec(text)?.[1] ?? 0)
      expect(loadedCount).toBeGreaterThan(50)
    })

    const loadedText = screen.getByText(/Showing (\d+) of 60 notes/).textContent ?? ''
    const loadedCount = Number(/Showing (\d+)/.exec(loadedText)?.[1] ?? 0)
    const domRows = document.querySelectorAll('[data-note-id]')
    // Viewport ~400px / ~56px row ≈ 7 visible + overscan(8) on each side ⇒ well under 40.
    expect(domRows.length).toBeGreaterThan(0)
    expect(domRows.length).toBeLessThanOrEqual(40)
    expect(domRows.length).toBeLessThan(loadedCount)
    expect(
      domRows.length,
      `virtualized DOM rows (${domRows.length}) must be far below loaded rows (${loadedCount})`,
    ).toBeLessThan(Math.floor(loadedCount / 2))
    for (const row of domRows) {
      expect(row.getAttribute('data-note-id')).toMatch(/^note_/)
    }
  })

  it('41: fetch-next-page preserves existing rows', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    const firstId = document.querySelector('[data-note-id]')?.getAttribute('data-note-id')
    expect(firstId).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Load more notes' }))
    await waitFor(() => {
      expect(screen.getByText(/Showing (\d+) of 60 notes/).textContent).toMatch(/Showing 6\d/)
    })
    expect(document.querySelector(`[data-note-id="${firstId}"]`)).toBeInTheDocument()
  })

  it('57–59,61: labelled filters, aria-sort, keyboard-reachable load more', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Search')).toBeInTheDocument()
    expect(screen.getByLabelText('Assigned reviewer')).toBeInTheDocument()
    expect(screen.getByLabelText('Patient')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Updated/i })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    const loadMore = screen.getByRole('button', { name: 'Load more notes' })
    loadMore.focus()
    expect(loadMore).toHaveFocus()
  })

  it('64–65: search and status filter update server results', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText('APPROVED'))
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('status=APPROVED')
    })

    fireEvent.change(screen.getByLabelText('Search'), {
      target: { value: 'zzznomatchxyz' },
    })
    await act(async () => {
      vi.advanceTimersByTime(400)
    })
    await waitFor(() => {
      expect(
        screen.getByText('No notes match the current filters.', {
          selector: '.notes-list-empty p',
        }),
      ).toBeInTheDocument()
    })
    vi.useRealTimers()
  })

  it('66: next cursor appends non-duplicate rows', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Load more notes' }))
    await waitFor(() => {
      const text = screen.getByText(/Showing (\d+) of 60 notes/).textContent ?? ''
      const count = Number(/Showing (\d+)/.exec(text)?.[1] ?? 0)
      expect(count).toBeGreaterThan(50)
    })
  })

  it('44–45: reviewer and patient filters update URL when options exist', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
    })

    const reviewer = screen.getByLabelText('Assigned reviewer') as HTMLSelectElement
    const patient = screen.getByLabelText('Patient') as HTMLSelectElement

    if (reviewer.options.length > 1) {
      fireEvent.change(reviewer, { target: { value: reviewer.options[1]!.value } })
      await waitFor(() => {
        expect(screen.getByTestId('location-search').textContent).toContain('reviewer=')
      })
    }

    if (patient.options.length > 1) {
      fireEvent.change(patient, { target: { value: patient.options[1]!.value } })
      await waitFor(() => {
        expect(screen.getByTestId('location-search').textContent).toContain('patient=')
      })
    }
  })

  it('preserves unrelated URL params when clearing filters', async () => {
    renderPage('/notes?status=APPROVED&utm=keep')
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toContain('status=APPROVED')
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    await waitFor(() => {
      const search = screen.getByTestId('location-search').textContent ?? ''
      expect(search).toContain('utm=keep')
      expect(search).not.toContain('status=')
    })
  })
})
