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

test('notes detail SOAP editor autosave serializes and preserves typed follow-up', async ({
  page,
}) => {
  await installAdminActor(page)

  const versionPosts: string[] = []
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
  await subjective.fill(`${originalSubjective} autosave-one`)
  await expect(page.getByTestId('soap-editor-save-label')).toHaveText(/Waiting to save/)

  await expect(page.getByTestId('soap-editor-save-label')).toHaveText('Saved', {
    timeout: 10_000,
  })
  await expect(page.locator('.soap-editor__base-version')).toContainText(
    `Editing base revision ${startingRevision + 1}`,
  )
  expect(versionPosts.length).toBeGreaterThanOrEqual(1)

  const objective = page.getByRole('textbox', { name: 'Objective' })
  const originalObjective = await objective.inputValue()
  await objective.fill(`${originalObjective} during-save-1`)
  await expect(page.getByTestId('soap-editor-save-label')).toHaveText(/Waiting to save|Saving/)
  await objective.fill(`${originalObjective} during-save-2`)

  await expect(page.getByTestId('soap-editor-save-label')).toHaveText('Saved', {
    timeout: 15_000,
  })
  await expect(objective).toHaveValue(`${originalObjective} during-save-2`)
  await expect(page.locator('.soap-editor__base-version')).toContainText(
    `Editing base revision ${startingRevision + 2}`,
  )

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('notes detail SOAP editor navigation guard while dirty before save completes', async ({
  page,
}) => {
  await installAdminActor(page)

  await page.goto('/notes')
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
    api!.setActorIdentity(api!.DEFAULT_DEV_ADMIN_ACTOR)
  })

  await page.getByRole('checkbox', { name: 'IN REVIEW' }).click()
  await page.locator('[data-note-id] a').first().click()
  await expect(page.getByRole('button', { name: 'Edit note' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Edit note' }).click()

  const plan = page.getByRole('textbox', { name: 'Plan' })
  await plan.fill(`${await plan.inputValue()} guard-change`)
  await expect(page.getByTestId('soap-editor-save-label')).toHaveText(/Waiting to save/)

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog')).toContainText('Leave without saving')
  await page.getByRole('button', { name: 'Stay and continue editing' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(plan).toHaveValue(/guard-change/)
})
