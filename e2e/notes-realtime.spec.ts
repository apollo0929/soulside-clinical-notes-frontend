import { expect, type Page, test } from '@playwright/test'

const LAST_EVENT_ID_STORAGE_KEY = 'soulside.realtime.lastEventId'
const PRESENCE_SESSION_STORAGE_KEY = 'soulside.presence.sessionId'

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

async function clearRealtimeSessionStorage(page: Page) {
  await page.addInitScript(
    ({ lastEventIdKey, presenceKey }) => {
      try {
        sessionStorage.removeItem(lastEventIdKey)
        sessionStorage.removeItem(presenceKey)
      } catch {
        // private mode / unavailable
      }
    },
    { lastEventIdKey: LAST_EVENT_ID_STORAGE_KEY, presenceKey: PRESENCE_SESSION_STORAGE_KEY },
  )
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

async function resetRealtimeEnvironment(page: Page) {
  await page
    .evaluate(() => {
      const api = (
        globalThis as {
          __SOULSIDE_REALTIME__?: { resetEnvironment?: () => void }
        }
      ).__SOULSIDE_REALTIME__
      api?.resetEnvironment?.()
      try {
        sessionStorage.removeItem('soulside.realtime.lastEventId')
        sessionStorage.removeItem('soulside.presence.sessionId')
      } catch {
        // private mode / unavailable
      }
    })
    .catch(() => {
      // Page may already be closed after a failed test.
    })
}

test.beforeEach(async ({ page }) => {
  await clearRealtimeSessionStorage(page)
  await installAdminActor(page)
})

test.afterEach(async ({ page }) => {
  await resetRealtimeEnvironment(page)
})

/**
 * Cross-tab MSW backends are isolated. This flow validates presence UI, DEV remote
 * version simulation, and dirty-editor protection on a single page.
 */
test('realtime remote version simulation preserves dirty draft', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/notes')
  await ensureAdminActor(page)
  await page.getByRole('checkbox', { name: 'IN REVIEW' }).click()
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })
  const noteId = await page.locator('[data-note-id]').first().getAttribute('data-note-id')
  expect(noteId).toBeTruthy()
  await page.locator('[data-note-id] a').first().click()
  await expect(page.getByRole('heading', { name: 'SOAP content' })).toBeVisible({
    timeout: 10_000,
  })
  await expect(page.getByTestId('note-presence-summary')).toHaveText(/No other viewers/i)

  await page.waitForFunction(() => {
    return Boolean(
      (globalThis as { __SOULSIDE_REALTIME__?: { simulateRemoteVersionCreated: unknown } })
        .__SOULSIDE_REALTIME__?.simulateRemoteVersionCreated,
    )
  })

  await page.getByRole('button', { name: 'Edit note' }).click()
  const subjective = page.getByRole('textbox', { name: 'Subjective' })
  const draftMarker = ` rt-draft-${Date.now()}`
  await subjective.fill(`${await subjective.inputValue()}${draftMarker}`)

  await page.evaluate(
    async ({ id }) => {
      const api = (
        globalThis as {
          __SOULSIDE_REALTIME__?: {
            simulateRemoteVersionCreated: (input: {
              noteId: string
              bumpRevisionBy?: number
            }) => void
          }
        }
      ).__SOULSIDE_REALTIME__
      api!.simulateRemoteVersionCreated({ noteId: id, bumpRevisionBy: 1 })
    },
    { id: noteId! },
  )

  await expect(page.getByRole('textbox', { name: 'Subjective' })).toHaveValue(
    new RegExp(draftMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )
  await expect(page.getByText(/newer version|conflict|preserved/i).first()).toBeVisible({
    timeout: 20_000,
  })
})

test('connectivity banner exposes realtime status text', async ({ page }) => {
  await page.goto('/notes')
  await ensureAdminActor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()

  await page.waitForFunction(() => {
    return Boolean(
      (globalThis as { __SOULSIDE_REALTIME__?: { resetEnvironment: unknown } })
        .__SOULSIDE_REALTIME__?.resetEnvironment,
    )
  })

  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'))
  })
  await expect(page.getByTestId('connectivity-banner')).toBeVisible()
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
    window.dispatchEvent(new Event('online'))
  })
  await expect
    .poll(
      async () => {
        const banner = page.getByTestId('connectivity-banner')
        if (!(await banner.count())) {
          return 'hidden-online'
        }
        return (await banner.textContent()) ?? ''
      },
      { timeout: 15_000 },
    )
    .toMatch(/Live updates|Reconnecting live|hidden-online|synchronized|Offline/i)
})
