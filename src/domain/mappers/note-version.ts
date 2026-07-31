import type { NoteId } from '@/domain/ids'
import { mapActorRefDtoToAuthor } from '@/domain/mappers/actors'
import { mapSoapContentDtoToDomain } from '@/domain/mappers/soap'
import type { NoteVersion, NoteVersionRef } from '@/domain/models/note-version'
import type { NoteVersionDetailDto, NoteVersionRefDto } from '@/domain/schemas/note-detail'

export function mapNoteVersionDtoToDomain(dto: NoteVersionDetailDto, noteId: NoteId): NoteVersion {
  const author = mapActorRefDtoToAuthor(dto.authoredBy)

  return {
    id: dto.id,
    noteId,
    revisionNumber: dto.revision,
    parentVersionId: dto.parentVersionId,
    content: mapSoapContentDtoToDomain(dto.content),
    authorId: author.authorId,
    authorRole: author.authorRole,
    createdAt: dto.createdAt,
  }
}

export function mapNoteVersionRefDtoToDomain(
  dto: NoteVersionRefDto,
  noteId: NoteId,
): NoteVersionRef {
  const author = mapActorRefDtoToAuthor(dto.authoredBy)

  return {
    id: dto.id,
    noteId,
    revisionNumber: dto.revision,
    parentVersionId: dto.parentVersionId,
    authorId: author.authorId,
    authorRole: author.authorRole,
    createdAt: dto.createdAt,
  }
}
