import { expect, test } from '@playwright/test'

test('notes detail SOAP editor dirty and navigation guard', async ({ page }) => {
  const versionPosts: string[] = []

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

  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/versions')) {
      versionPosts.push(request.url())
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

  await page.getByRole('checkbox', { name: 'IN REVIEW' }).click()
  await expect(page).toHaveURL(/status=IN_REVIEW/)
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })

  await page.locator('[data-note-id] a').first().click()
  await expect(page.getByRole('heading', { name: 'SOAP content' })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Edit note' }).click()
  await expect(page.getByTestId('soap-editor')).toBeVisible()

  const subjective = page.getByRole('textbox', { name: 'Subjective' })
  const originalSubjective = await subjective.inputValue()
  await subjective.fill(`${originalSubjective} editor-change`)
  await expect(page.locator('#soap-editor-subjective-status')).toHaveText('Modified')

  const plan = page.getByRole('textbox', { name: 'Plan' })
  const originalPlan = await plan.inputValue()
  await plan.fill(`${originalPlan} plan-change`)
  await expect(page.getByTestId('soap-editor-save-label')).toHaveText('2 unsaved sections')

  await subjective.fill(originalSubjective)
  await expect(page.locator('#soap-editor-subjective-status')).toHaveText('Saved')
  await expect(page.getByTestId('soap-editor-save-label')).toHaveText('1 unsaved section')

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Leave without saving')
  await page.getByRole('button', { name: 'Stay and continue editing' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(plan).toHaveValue(`${originalPlan} plan-change`)

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await page.getByRole('button', { name: 'Discard and leave' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page).toHaveURL(/\/notes/)
  expect(versionPosts).toHaveLength(0)
})
