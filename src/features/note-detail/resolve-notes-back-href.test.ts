import { describe, expect, it } from 'vitest'

import { resolveNotesBackHref } from '@/features/note-detail/note-detail.types'

describe('resolveNotesBackHref', () => {
  it('falls back to /notes for missing or unsafe state', () => {
    expect(resolveNotesBackHref(undefined)).toBe('/notes')
    expect(resolveNotesBackHref({ fromList: 'https://evil.example/notes' })).toBe('/notes')
    expect(resolveNotesBackHref({ fromList: '//evil.example/notes' })).toBe('/notes')
    expect(resolveNotesBackHref({ fromList: '/notes/../admin' })).toBe('/notes')
    expect(resolveNotesBackHref({ fromList: '/notesevil' })).toBe('/notes')
    expect(resolveNotesBackHref({ fromList: '/notes/note_1' })).toBe('/notes')
  })

  it('preserves list path with query filters', () => {
    expect(resolveNotesBackHref({ fromList: '/notes' })).toBe('/notes')
    expect(resolveNotesBackHref({ fromList: '/notes?status=APPROVED' })).toBe(
      '/notes?status=APPROVED',
    )
  })
})
