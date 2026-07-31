import type { SoapContent } from '@/domain/models/soap'
import type { SoapContentDto, SoapSectionsDto } from '@/domain/schemas/soap'

export function mapSoapSectionsDtoToDomain(sections: SoapSectionsDto): SoapContent {
  return Object.freeze({
    subjective: sections.S,
    objective: sections.O,
    assessment: sections.A,
    plan: sections.P,
  })
}

export function mapSoapContentDtoToDomain(dto: SoapContentDto): SoapContent {
  return mapSoapSectionsDtoToDomain(dto.sections)
}

export function mapSoapContentToDto(content: SoapContent): SoapContentDto {
  return {
    sections: {
      S: content.subjective,
      O: content.objective,
      A: content.assessment,
      P: content.plan,
    },
  }
}
