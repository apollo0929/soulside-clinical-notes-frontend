import { screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { parseIsoDateTime } from '@/domain/datetime'
import { parseNoteId, parsePatientId, parseVersionId } from '@/domain/ids'
import type { NoteSummary } from '@/domain/models/note-summary'
import { NOTES_VIRTUAL_ROW_HEIGHT } from '@/features/notes-list/notes-virtual-row'
import {
  NotesVirtualList,
  type NotesVirtualListProps,
} from '@/features/notes-list/NotesVirtualList'
import { render } from '@/test/helpers/render'

function makeNote(index: number): NoteSummary {
  return {
    id: parseNoteId(`note_${index}`),
    patientId: parsePatientId(`pat_${index}`),
    patientDisplayName: `Patient ${index} with a long display name`,
    status: 'READY_FOR_REVIEW',
    currentVersionId: parseVersionId(`ver_${index}`),
    currentRevision: 1,
    assignedReviewer: null,
    createdAt: parseIsoDateTime('2024-01-01T00:00:00.000Z'),
    updatedAt: parseIsoDateTime('2024-01-02T00:00:00.000Z'),
  }
}

function parseTranslateY(transform: string): number {
  const match = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(transform)
  expect(match, `expected translateY in "${transform}"`).not.toBeNull()
  return Number(match![1])
}

function renderList(overrides: Partial<NotesVirtualListProps> = {}) {
  const rows = Array.from({ length: 80 }, (_, index) => makeNote(index))
  const props: NotesVirtualListProps = {
    rows,
    sortField: 'updatedAt',
    sortDirection: 'desc',
    onSortFieldChange: () => undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    onLoadMore: () => undefined,
    selectedIds: new Set(),
    selectAllState: 'unchecked',
    onToggleRow: () => undefined,
    onToggleSelectAll: () => undefined,
    pendingIds: new Set(),
    selectionDisabled: false,
    listReturnTo: '/notes',
    ...overrides,
  }

  return {
    rows: props.rows,
    ...render(
      <MemoryRouter>
        <NotesVirtualList {...props} />
      </MemoryRouter>,
    ),
  }
}

describe('NotesVirtualList row layout', () => {
  beforeAll(() => {
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

  afterAll(() => {
    vi.unstubAllGlobals()
  })

  it('uses fixed non-overlapping NoteId-keyed rows shorter than loaded data', async () => {
    const { rows } = renderList()

    await waitFor(() => {
      expect(document.querySelectorAll('[data-note-id]').length).toBeGreaterThan(0)
    })

    const domRows = [...document.querySelectorAll<HTMLElement>('[data-note-id]')]
    expect(domRows.length).toBeGreaterThan(0)
    expect(domRows.length).toBeLessThan(rows.length)
    expect(domRows.length).toBeLessThanOrEqual(40)

    const starts: number[] = []
    for (const row of domRows) {
      expect(row.getAttribute('data-note-id')).toMatch(/^note_/)
      expect(row.style.height).toBe(`${NOTES_VIRTUAL_ROW_HEIGHT}px`)
      expect(row.style.position).toBe('absolute')
      expect(row.style.top).toBe('0px')
      expect(row.style.left).toBe('0px')
      expect(row.style.width).toBe('100%')
      starts.push(parseTranslateY(row.style.transform))

      const patientCell = row.querySelector('.notes-virtual__cell--patient')
      expect(patientCell).not.toBeNull()
      expect(row.querySelector('.notes-virtual__note-id')).toBeNull()
      expect(patientCell!.querySelector('.notes-virtual__patient')).toBeInTheDocument()
      expect(patientCell!.textContent).toMatch(/Open note note_/)
      // Note ID is accessible only via hidden text / checkbox label, not a second visual line.
      expect(patientCell!.querySelectorAll('span')).toHaveLength(2)
    }

    const ordered = [...starts].sort((a, b) => a - b)
    expect(starts).toEqual(ordered)
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]! - ordered[index - 1]!).toBe(NOTES_VIRTUAL_ROW_HEIGHT)
    }

    const body = document.querySelector<HTMLElement>('.notes-virtual__body')
    expect(body).not.toBeNull()
    expect(body!.style.height).toBe(`${rows.length * NOTES_VIRTUAL_ROW_HEIGHT}px`)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Patient/ })).toBeInTheDocument()
  })
})
