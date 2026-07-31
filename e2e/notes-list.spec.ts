import { expect, test } from '@playwright/test'

test('notes list smoke', async ({ page }) => {
  await page.goto('/notes')

  await expect(page.getByRole('heading', { level: 1, name: 'Clinical notes' })).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-note-id]').first()).toBeVisible()

  await page.getByRole('checkbox', { name: 'APPROVED' }).click()
  await expect(page.getByRole('checkbox', { name: 'APPROVED' })).toBeChecked()
  await expect(page).toHaveURL(/status=APPROVED/)

  await page.getByLabel('Search').fill('avery')
  await expect(page).toHaveURL(/q=avery/, { timeout: 5_000 })

  await page.getByRole('button', { name: 'Clear filters' }).first().click()
  await expect(page).toHaveURL(/\/notes\/?$/)

  const loadMore = page.getByRole('button', { name: 'Load more notes' })
  if (await loadMore.isVisible()) {
    await loadMore.focus()
    await expect(loadMore).toBeFocused()
  } else {
    await page.locator('[data-note-id]').first().focus()
  }
})
