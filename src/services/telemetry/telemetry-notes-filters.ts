import type { NotesListFilters } from '@/features/notes-list/notes-list.types'
import type { NotesListSortField } from '@/services/api/notes-api'

export function toTelemetrySortField(
  field: NotesListSortField,
): 'UPDATED_AT' | 'CREATED_AT' | 'STATUS' {
  switch (field) {
    case 'updatedAt':
      return 'UPDATED_AT'
    case 'createdAt':
      return 'CREATED_AT'
    case 'status':
      return 'STATUS'
    case 'patientDisplayName':
      // Telemetry allowlist has no patient-name sort; map to a safe status bucket.
      return 'STATUS'
    default: {
      const _exhaustive: never = field
      return _exhaustive
    }
  }
}

export function notesFiltersTelemetryPayload(filters: NotesListFilters) {
  return {
    hasSearch: filters.searchQuery.trim().length > 0,
    selectedStatusCount: filters.statuses.length,
    hasCreatedFrom: filters.dateFrom !== null,
    hasCreatedTo: filters.dateTo !== null,
    sortField: toTelemetrySortField(filters.sortField),
    sortDirection: (filters.sortDirection === 'asc' ? 'ASC' : 'DESC') as 'ASC' | 'DESC',
  }
}
