import { expect, type Page, test } from '@playwright/test'

async function installAdminActor(page: Page) {
  await page.addInitScript(() => {
    const install = () => {
      const api = (
        globalThis as {
          __SOULSIDE_ACTOR__?: {
            setActorIdentity: (actor: { userId: string; role: string }) => void
            DEFAULT_DEV_ADMIN_ACTOR: { userId: string; role: string }
          }
        }
      ).__SOULSIDE_ACTOR__
      if (!api) {
        return false
      }
      api.setActorIdentity(api.DEFAULT_DEV_ADMIN_ACTOR)
      return true
    }
    if (!install()) {
      const timer = globalThis.setInterval(() => {
        if (install()) {
          globalThis.clearInterval(timer)
        }
      }, 10)
    }
  })
}

async function ensureAdminActor(page: Page) {
  await page.waitForFunction(() => {
    return Boolean(
      (
        globalThis as {
          __SOULSIDE_ACTOR__?: { DEFAULT_DEV_ADMIN_ACTOR: unknown }
        }
      ).__SOULSIDE_ACTOR__?.DEFAULT_DEV_ADMIN_ACTOR,
    )
  })
  await page.evaluate(() => {
    const api = (
      globalThis as {
        __SOULSIDE_ACTOR__?: {
          setActorIdentity: (actor: { userId: string; role: string }) => void
          DEFAULT_DEV_ADMIN_ACTOR: { userId: string; role: string }
        }
      }
    ).__SOULSIDE_ACTOR__
    if (!api) {
      throw new Error('Dev actor API was not installed')
    }
    api.setActorIdentity(api.DEFAULT_DEV_ADMIN_ACTOR)
  })
}

test('privacy-safe telemetry flow captures allowlisted events without clinical content', async ({
  page,
}) => {
  test.setTimeout(90_000)

  // Capture telemetry POSTs before MSW service worker (Playwright route may miss SW fetches).
  await page.addInitScript(() => {
    type Capture = { eventNames: string[]; body: string }
    const store = ((
      globalThis as { __SOULSIDE_TELEMETRY_CAPTURE__?: Capture[] }
    ).__SOULSIDE_TELEMETRY_CAPTURE__ ??= [])
    const originalFetch = globalThis.fetch.bind(globalThis)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method =
        init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
      if (url.includes('/api/telemetry/batches') && String(method).toUpperCase() === 'POST') {
        if (
          (globalThis as { __SOULSIDE_TELEMETRY_FORCE_FAIL__?: boolean })
            .__SOULSIDE_TELEMETRY_FORCE_FAIL__
        ) {
          return new Response(
            JSON.stringify({
              error: { code: 'SIMULATED_INTERNAL_ERROR', message: 'Simulated telemetry failure.' },
            }),
            { status: 500, headers: { 'content-type': 'application/json' } },
          )
        }
        const body =
          typeof init?.body === 'string'
            ? init.body
            : init?.body instanceof Blob
              ? await init.body.text()
              : ''
        try {
          const parsed = JSON.parse(body) as { events: Array<{ eventName: string }> }
          store.push({
            eventNames: parsed.events.map((event) => event.eventName),
            body,
          })
        } catch {
          store.push({ eventNames: [], body })
        }
      }
      return originalFetch(input, init)
    }
  })

  await installAdminActor(page)
  await page.goto('/notes')
  await ensureAdminActor(page)
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole('checkbox', { name: 'IN REVIEW' }).click()
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })

  await page.locator('[data-note-id] a').first().click()
  await expect(page.getByRole('heading', { name: 'SOAP content' })).toBeVisible({
    timeout: 10_000,
  })

  const edit = page.getByRole('button', { name: 'Edit note' })
  if (await edit.isVisible()) {
    await edit.click()
    await page.getByRole('textbox', { name: 'Subjective' }).fill('telemetry e2e draft text')
    await page.waitForTimeout(900)
  }

  await page.waitForFunction(() => {
    return Boolean(
      (globalThis as { __SOULSIDE_TELEMETRY__?: { flush: unknown } }).__SOULSIDE_TELEMETRY__?.flush,
    )
  })
  await page.evaluate(async () => {
    await (
      globalThis as { __SOULSIDE_TELEMETRY__: { flush: () => Promise<void> } }
    ).__SOULSIDE_TELEMETRY__.flush()
  })

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (
          (globalThis as { __SOULSIDE_TELEMETRY_CAPTURE__?: Array<{ eventNames: string[] }> })
            .__SOULSIDE_TELEMETRY_CAPTURE__ ?? []
        ).length
      })
    })
    .toBeGreaterThan(0)

  const batches = await page.evaluate(() => {
    return (
      (
        globalThis as {
          __SOULSIDE_TELEMETRY_CAPTURE__?: Array<{ eventNames: string[]; body: string }>
        }
      ).__SOULSIDE_TELEMETRY_CAPTURE__ ?? []
    )
  })

  const names = batches.flatMap((batch) => batch.eventNames)
  expect(names).toEqual(expect.arrayContaining(['NOTES_LIST_VIEWED', 'NOTES_FILTERS_APPLIED']))
  expect(names).toEqual(expect.arrayContaining(['NOTE_DETAIL_OPENED']))

  const joined = batches.map((batch) => batch.body).join('\n')
  expect(joined).not.toMatch(/telemetry e2e draft text/)
  expect(joined).not.toMatch(/subjective|patientDisplayName|rejectionReason/i)
  expect(joined).not.toMatch(/"noteId"\s*:/)
  expect(joined).not.toMatch(/note_[0-9a-f_]{6,}/i)

  // Inject delivery failure, then confirm product navigation still works.
  await page.evaluate(() => {
    ;(
      globalThis as { __SOULSIDE_TELEMETRY_FORCE_FAIL__?: boolean }
    ).__SOULSIDE_TELEMETRY_FORCE_FAIL__ = true
  })

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })

  await page.evaluate(() => {
    ;(
      globalThis as { __SOULSIDE_TELEMETRY_FORCE_FAIL__?: boolean }
    ).__SOULSIDE_TELEMETRY_FORCE_FAIL__ = false
  })
  await page.evaluate(async () => {
    await (
      globalThis as { __SOULSIDE_TELEMETRY__: { flush: () => Promise<void> } }
    ).__SOULSIDE_TELEMETRY__.flush()
  })
})
