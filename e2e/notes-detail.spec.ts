import { expect, test } from '@playwright/test'

test('notes detail read-only flow preserves list filters', async ({ page }) => {
  await page.goto('/notes')

  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('checkbox', { name: 'APPROVED' }).click()
  await expect(page.getByRole('checkbox', { name: 'APPROVED' })).toBeChecked()
  await expect(page).toHaveURL(/status=APPROVED/)

  const firstLink = page.locator('[data-note-id] a').first()
  await expect(firstLink).toBeVisible({ timeout: 10_000 })
  await firstLink.click()

  await expect(page).toHaveURL(/\/notes\/note_/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Subjective' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Version history' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Review timeline' })).toBeVisible()

  const history = page.getByRole('navigation', { name: 'Version history' })
  const baseRadios = history.locator('input[name="version-base"]')
  const compareRadios = history.locator('input[name="version-compare"]')
  const baseCount = await baseRadios.count()
  if (baseCount >= 2) {
    await expect(page.getByRole('group', { name: 'Diff legend' })).toBeVisible()
    await baseRadios.nth(1).focus()
    await expect(baseRadios.nth(1)).toBeFocused()
    await baseRadios.nth(1).check()
    await compareRadios.nth(0).check()
    await expect(page.getByRole('group', { name: 'Diff legend' })).toBeVisible({ timeout: 10_000 })
  }

  await page.getByRole('link', { name: 'Back to notes' }).first().click()
  await expect(page).toHaveURL(/\/notes/)
  await expect(page).toHaveURL(/status=APPROVED/)
  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
})
