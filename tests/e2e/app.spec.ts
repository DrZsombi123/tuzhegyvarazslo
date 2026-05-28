import { expect, test } from '@playwright/test'

test('starts the game, chooses a potion, saves, and follows a choice', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'A Tűzhegy Varázslója' })).toBeVisible()
  await expect(page.locator('.node-number')).toContainText('#1')

  await page.getByRole('region', { name: 'Indulóital' }).getByRole('button', { name: 'Szerencse' }).click()
  await expect(page.getByText('Választott ital: Szerencse Itala.', { exact: false })).toBeVisible()

  await page.getByRole('button', { name: 'Mentés' }).click()
  await expect(page.getByText('Mentés kész.')).toBeVisible()

  const firstChoice = page.locator('.choice-button').first()
  await expect(firstChoice).toBeEnabled()
  await firstChoice.click()

  await expect(page.locator('.node-number')).not.toContainText('#1')
})

test('exposes character sheet stats with Hungarian labels', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Ügyesség', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Életerő', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Felszerelés', { exact: false }).first()).toBeVisible()
})
