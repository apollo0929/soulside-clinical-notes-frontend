import { QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { parseNoteId, parseVersionId } from '@/domain/ids'
import { useNoteAutosave } from '@/features/note-detail/autosave/use-note-autosave'
import {
  createInitialSoapEditorState,
  soapEditorReducer,
} from '@/features/note-detail/editor/soap-editor.reducer'
import {
  DEFAULT_DEV_ADMIN_ACTOR,
  resetActorIdentity,
  setActorIdentity,
} from '@/services/api/actor-provider'
import { createDeterministicClientMutationIdGenerator } from '@/services/api/client-mutation-id'
import { buildSoapContent } from '@/test/fixtures/domain'
import { createTestQueryClient } from '@/test/helpers/queryClient'

const noteId = parseNoteId('note_hook_1')
const versionA = parseVersionId('ver_hook_a')

describe('useNoteAutosave debounce', () => {
  beforeEach(() => {
    setActorIdentity(DEFAULT_DEV_ADMIN_ACTOR)
  })

  afterEach(() => {
    resetActorIdentity()
    vi.restoreAllMocks()
  })

  function wrapper({ children }: { children: ReactNode }) {
    const client = createTestQueryClient()
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }

  it('19–24: dirty change debounces and submits latest draft only', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          version: {
            id: 'ver_hook_b',
            revision: 2,
            parentVersionId: String(versionA),
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })

    const { result } = renderHook(
      () => {
        const [state, dispatch] = useReducer(
          soapEditorReducer,
          createInitialSoapEditorState({
            noteId,
            baseVersionId: versionA,
            content: buildSoapContent({ subjective: 'base' }),
          }),
        )
        const autosave = useNoteAutosave({
          enabled: true,
          noteId,
          editorState: state,
          dispatch,
          mutationIdGenerator: createDeterministicClientMutationIdGenerator(),
          debounceMs: 40,
        })
        return { state, dispatch, autosave }
      },
      { wrapper },
    )

    await waitFor(() => {
      expect(result.current.autosave.status.kind).toBe('CLEAN')
    })

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_SECTION',
        section: 'subjective',
        value: 'one',
      })
    })
    expect(result.current.autosave.status.kind).toBe('DEBOUNCING')
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_SECTION',
        section: 'subjective',
        value: 'two',
      })
    })
    expect(fetchMock).not.toHaveBeenCalled()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body)) as {
      content: { sections: { S: string } }
      clientMutationId: string
      baseVersionId: string
    }
    expect(body.content.sections.S).toBe('two')
    expect(body.clientMutationId).toBe('mut_test_1')
    expect(body.baseVersionId).toBe(String(versionA))
  })

  it('23–25: clean and disabled cancel pending debounce without saving', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          version: { id: 'ver_hook_b', revision: 2, parentVersionId: String(versionA) },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )

    const { result, rerender, unmount } = renderHook(
      ({ enabled }: { enabled: boolean }) => {
        const [state, dispatch] = useReducer(
          soapEditorReducer,
          createInitialSoapEditorState({
            noteId,
            baseVersionId: versionA,
            content: buildSoapContent({ subjective: 'base' }),
          }),
        )
        const autosave = useNoteAutosave({
          enabled,
          noteId,
          editorState: state,
          dispatch,
          mutationIdGenerator: createDeterministicClientMutationIdGenerator('mut_cancel'),
          debounceMs: 80,
        })
        return { state, dispatch, autosave }
      },
      { wrapper, initialProps: { enabled: true } },
    )

    await waitFor(() => {
      expect(result.current.autosave.status.kind).toBe('CLEAN')
    })

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_SECTION',
        section: 'subjective',
        value: 'dirty',
      })
    })
    expect(result.current.autosave.status.kind).toBe('DEBOUNCING')

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_SECTION',
        section: 'subjective',
        value: 'base',
      })
    })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(fetchMock).not.toHaveBeenCalled()

    act(() => {
      result.current.dispatch({
        type: 'UPDATE_SECTION',
        section: 'subjective',
        value: 'again',
      })
    })
    rerender({ enabled: false })
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(fetchMock).not.toHaveBeenCalled()

    unmount()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 120))
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
