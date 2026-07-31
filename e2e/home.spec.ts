import { expect, test } from '@playwright/test'

test('home page smoke', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { level: 1, name: 'Soulside Clinical Notes' }),
  ).toBeVisible()
  await expect(page.getByText(/application shell is running/i)).toBeVisible()
})
