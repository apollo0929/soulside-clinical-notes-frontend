import { expect, test } from '@playwright/test'

test('notes list bulk regenerate flow', async ({ page }) => {
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

  await page.goto('/notes')

  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })

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

  await page.getByRole('checkbox', { name: 'FAILED' }).click()
  await expect(page.getByRole('checkbox', { name: 'FAILED' })).toBeChecked()
  await expect(page).toHaveURL(/status=FAILED/)

  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })

  const checkboxes = page.locator('[data-note-id] input[type="checkbox"]')
  await expect(checkboxes.nth(0)).toBeVisible()
  await checkboxes.nth(0).focus()
  await page.keyboard.press('Space')
  await checkboxes.nth(1).focus()
  await page.keyboard.press('Space')

  await expect(page.getByTestId('bulk-action-toolbar')).toBeVisible()
  await expect(page.getByText(/2 notes selected/)).toBeVisible()

  const regenerate = page.getByRole('button', { name: 'Request regeneration' })
  await regenerate.focus()
  await expect(regenerate).toBeFocused()
  await regenerate.click()

  await expect(page.getByTestId('bulk-result-announcement')).toContainText(/updated/i, {
    timeout: 10_000,
  })

  await expect(page.getByTestId('bulk-action-toolbar')).toHaveCount(0)
  await expect(page).toHaveURL(/status=FAILED/)
})
