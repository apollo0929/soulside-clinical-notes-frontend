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

async function ensureAdmin(page: import('@playwright/test').Page) {
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

test('notes detail three-way conflict resolution flow', async ({ page }) => {
  await installAdminActor(page)

  await page.goto('/notes')
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
  await ensureAdmin(page)

  await page.getByRole('checkbox', { name: 'IN REVIEW' }).click()
  await expect(page).toHaveURL(/status=IN_REVIEW/)
  await expect(page.locator('[data-note-id]').first()).toBeVisible({ timeout: 10_000 })
  await page.locator('[data-note-id] a').first().click()
  await expect(page.getByRole('heading', { name: 'SOAP content' })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByRole('button', { name: 'Edit note' }).click()
  await expect(page.getByTestId('soap-editor')).toBeVisible()

  const noteUrl = page.url()
  const noteId = noteUrl.match(/\/notes\/([^/?#]+)/)?.[1]
  expect(noteId).toBeTruthy()

  const detail = await page.evaluate(async (id) => {
    const response = await fetch(`/api/notes/${id}`, {
      headers: {
        'x-user-id': 'usr_admin_42',
        'x-user-role': 'ADMIN',
      },
    })
    if (!response.ok) {
      throw new Error(`detail ${response.status}`)
    }
    return (await response.json()) as {
      currentVersion: {
        id: string
        revision: number
        content: { sections: { S: string; O: string; A: string; P: string } }
      }
    }
  }, noteId!)

  const baseId = detail.currentVersion.id
  const baseRevision = detail.currentVersion.revision
  const sections = detail.currentVersion.content.sections

  const subjective = page.getByRole('textbox', { name: 'Subjective' })
  const objective = page.getByRole('textbox', { name: 'Objective' })
  const assessment = page.getByRole('textbox', { name: 'Assessment' })
  const plan = page.getByRole('textbox', { name: 'Plan' })

  const localS = `${sections.S} local-S`
  const localO = `${sections.O} local-O`
  const localA = `${sections.A} local-A`

  // Dirty the editor before the concurrent write so realtime preserves the draft
  // (clean editors reinitialize to the new head and would not conflict).
  await subjective.fill(localS)
  await objective.fill(localO)
  await assessment.fill(localA)

  const concurrentBody = await page.evaluate(
    async ({ id, baseVersionId, sections: soap }) => {
      const response = await fetch(`/api/notes/${id}/versions`, {
        method: 'POST',
        headers: {
          'x-user-id': 'usr_admin_42',
          'x-user-role': 'ADMIN',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          baseVersionId,
          content: {
            sections: {
              S: `${soap.S} server-S`,
              O: `${soap.O} server-O`,
              A: `${soap.A} server-A`,
              P: soap.P,
            },
          },
          clientMutationId: `mut_e2e_concurrent_${Date.now()}`,
        }),
      })
      if (!response.ok) {
        throw new Error(`concurrent ${response.status}: ${await response.text()}`)
      }
      return (await response.json()) as { version: { revision: number; id: string } }
    },
    { id: noteId!, baseVersionId: baseId, sections },
  )
  const serverHeadRevision = concurrentBody.version.revision

  const conflictHeading = page.getByRole('heading', {
    name: /Version conflict — resolve before continuing/i,
  })
  await expect(conflictHeading).toBeVisible({ timeout: 15_000 })
  await expect(
    page.getByText(/Your local edits have been preserved and are shown below/i),
  ).toBeVisible()
  const conflictMeta = page.locator('.conflict-resolver__meta')
  await expect(conflictMeta.getByText('Server head revision')).toBeVisible()
  await expect(conflictMeta.locator('dd').nth(0)).toHaveText(String(serverHeadRevision))
  await expect(conflictMeta.getByText('Common ancestor revision')).toBeVisible()
  await expect(conflictMeta.locator('dd').nth(1)).toHaveText(String(baseRevision))
  await expect(subjective).toHaveValue(localS)
  await expect(subjective).toHaveAttribute('readonly')

  await page
    .getByRole('group', { name: /How should Subjective be resolved/i })
    .getByRole('radio', { name: 'Keep mine' })
    .check()
  await page
    .getByRole('group', { name: /How should Objective be resolved/i })
    .getByRole('radio', { name: 'Use server' })
    .check()
  await page
    .getByRole('group', { name: /How should Assessment be resolved/i })
    .getByRole('radio', { name: 'Manual merge' })
    .check()
  await page.getByLabel(/Manual Assessment text/i).fill('manual-A-e2e')

  const resolveButton = page.getByRole('button', { name: 'Resolve and save' })
  await expect(resolveButton).toBeEnabled()
  await resolveButton.click()

  await expect(conflictHeading).toHaveCount(0, { timeout: 15_000 })
  await expect(page.getByTestId('soap-editor-save-label')).toHaveText(/No local changes|Saved/)
  await expect(page.locator('.soap-editor__base-version')).toContainText(
    `Editing base revision ${serverHeadRevision + 1}`,
  )
  await expect(subjective).toHaveValue(localS)
  await expect(objective).toHaveValue(`${sections.O} server-O`)
  await expect(assessment).toHaveValue('manual-A-e2e')
  await expect(plan).toHaveValue(sections.P)

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
