import { expect, test } from '@playwright/test'

async function installAdminActor(page: import('@playwright/test').Page) {
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

function isBackendApiUrl(url: URL): boolean {
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

/**
 * Simulate offline for backend API traffic without blocking Vite modules.
 * Do not use a loose "api" path glob — it also matches /src/services/api modules.
 * Full context.setOffline(true) cannot reload a non-PWA Vite shell; IndexedDB reload
 * isolation is covered by unit/integration tests.
 */
async function simulateApiOffline(page: import('@playwright/test').Page) {
  await page.route(isBackendApiUrl, async (route) => {
    await route.abort('connectionfailed')
  })
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => false,
    })
    window.dispatchEvent(new Event('offline'))
  })
}

async function restoreApiOnline(page: import('@playwright/test').Page) {
  await page.unroute(isBackendApiUrl)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => true,
    })
    window.dispatchEvent(new Event('online'))
  })
}

async function ensureAdminActor(page: import('@playwright/test').Page) {
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

test('offline edit queues locally and replays on reconnect', async ({ page }) => {
  test.setTimeout(60_000)
  await installAdminActor(page)

  await page.goto('/notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
  await ensureAdminActor(page)

  await page.getByRole('checkbox', { name: 'IN REVIEW' }).click()
  await expect(page).toHaveURL(/status=IN_REVIEW/)
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-note-id] a').first().click()
  await expect(page.getByRole('heading', { name: 'SOAP content' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Edit note' }).click()
  await expect(page.getByTestId('soap-editor')).toBeVisible()

  const baseRevisionText = await page.locator('.soap-editor__base-version').textContent()
  const baseRevisionMatch = baseRevisionText?.match(/Editing base revision (\d+)/)
  expect(baseRevisionMatch).toBeTruthy()
  const startingRevision = Number(baseRevisionMatch![1])

  const subjective = page.getByRole('textbox', { name: 'Subjective' })
  const originalSubjective = await subjective.inputValue()
  const offlineMarker = ` offline-resume-${Date.now()}`

  await simulateApiOffline(page)
  await subjective.fill(`${originalSubjective}${offlineMarker}`)

  await expect(page.getByTestId('soap-editor-save-label')).toHaveText(
    /Saved on this device|waiting to sync/i,
    { timeout: 10_000 },
  )
  await expect(page.getByTestId('connectivity-banner')).toBeVisible()

  await restoreApiOnline(page)

  await expect(page.locator('.soap-editor__base-version')).toContainText(
    `Editing base revision ${startingRevision + 1}`,
    { timeout: 30_000 },
  )
  await expect(page.getByRole('textbox', { name: 'Subjective' })).toHaveValue(
    new RegExp(offlineMarker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
  )

  // Locally durable / synced: navigate away without a data-loss dialog.
  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible({
    timeout: 10_000,
  })
})
