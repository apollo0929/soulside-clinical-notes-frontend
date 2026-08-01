import { http, HttpResponse } from 'msw'
import { z } from 'zod'

import { parseNoteId, parseSessionId } from '@/domain/ids'
import { presenceActivitySchema, realtimeEventDtoSchema } from '@/domain/schemas/realtime'
import { createMockApiError, isMockApiError } from '@/mock/errors'
import {
  ACTOR_USER_ID_HEADER,
  ACTOR_USER_ROLE_HEADER,
  parseActorHeaders,
} from '@/mock/msw/actor-headers'
import type { MockBackendService } from '@/mock/services/backend'

const joinBodySchema = z.strictObject({
  sessionId: z.string().min(1),
  noteId: z.string().min(1),
  activity: presenceActivitySchema,
  displayName: z.string().min(1),
})

const sessionBodySchema = z.strictObject({
  sessionId: z.string().min(1),
})

/**
 * SSE stream + presence endpoints for mock realtime.
 * Actor identity for EventSource is read from query params (EventSource cannot set headers).
 */
export function createRealtimeHandlers(backend: MockBackendService) {
  return [
    http.get('*/api/realtime/stream', ({ request }) => {
      const url = new URL(request.url)
      const headers = new Headers(request.headers)
      const userId = url.searchParams.get(ACTOR_USER_ID_HEADER)
      const role = url.searchParams.get(ACTOR_USER_ROLE_HEADER)
      if (userId) {
        headers.set(ACTOR_USER_ID_HEADER, userId)
      }
      if (role) {
        headers.set(ACTOR_USER_ROLE_HEADER, role)
      }

      const actor = parseActorHeaders(headers)
      if (isMockApiError(actor)) {
        return HttpResponse.json({ error: actor.message }, { status: actor.status })
      }

      const lastEventId = url.searchParams.get('lastEventId')
      const encoder = new TextEncoder()

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: unknown) => {
            const validated = realtimeEventDtoSchema.safeParse(event)
            if (!validated.success) {
              return
            }
            try {
              controller.enqueue(
                encoder.encode(
                  `id: ${validated.data.eventId}\ndata: ${JSON.stringify(validated.data)}\n\n`,
                ),
              )
            } catch {
              unsubscribe()
            }
          }

          const unsubscribe = backend.realtime.connect({
            actor,
            lastEventId,
            onEvent: send,
          })

          request.signal.addEventListener(
            'abort',
            () => {
              unsubscribe()
              controller.close()
            },
            { once: true },
          )
        },
        cancel() {
          // Abort listener performs cleanup.
        },
      })

      return new HttpResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      })
    }),

    http.post('*/api/realtime/presence/join', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return HttpResponse.json({ error: actor.message }, { status: actor.status })
      }
      const body = joinBodySchema.safeParse(await request.json())
      if (!body.success) {
        return HttpResponse.json(
          {
            error: createMockApiError({
              code: 'INVALID_REQUEST',
              status: 400,
              message: 'Invalid presence join.',
            }),
          },
          { status: 400 },
        )
      }
      backend.realtime.joinPresence({
        sessionId: parseSessionId(body.data.sessionId),
        noteId: parseNoteId(body.data.noteId),
        userId: actor.userId,
        displayName: body.data.displayName,
        role: actor.role,
        activity: body.data.activity,
      })
      return HttpResponse.json({ ok: true })
    }),

    http.post('*/api/realtime/presence/heartbeat', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return HttpResponse.json({ error: actor.message }, { status: actor.status })
      }
      const body = sessionBodySchema.safeParse(await request.json())
      if (!body.success) {
        return HttpResponse.json({ error: 'Invalid heartbeat' }, { status: 400 })
      }
      const ok = backend.realtime.heartbeatPresence(parseSessionId(body.data.sessionId))
      return HttpResponse.json({ ok })
    }),

    http.post('*/api/realtime/presence/leave', async ({ request }) => {
      const actor = parseActorHeaders(request.headers)
      if (isMockApiError(actor)) {
        return HttpResponse.json({ error: actor.message }, { status: actor.status })
      }
      const body = sessionBodySchema.safeParse(await request.json())
      if (!body.success) {
        return HttpResponse.json({ error: 'Invalid leave' }, { status: 400 })
      }
      backend.realtime.leavePresence(parseSessionId(body.data.sessionId))
      return HttpResponse.json({ ok: true })
    }),
  ]
}
