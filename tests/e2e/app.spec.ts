import { expect, test } from '@playwright/test'

test('opens the Moving Features server data source workflow', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: 'Moving Features' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Open Data' }).click()
  await page.getByRole('tab', { name: 'Server' }).click()

  await expect(page.getByLabel('Server URL')).toHaveValue(
    'http://localhost:5050',
  )
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible()
})

test('keeps the server workflow usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open Data' }).click()
  await page.getByRole('tab', { name: 'Server' }).click()

  await expect(page.getByRole('dialog')).toBeInViewport()
  await expect(page.getByLabel('Server URL')).toBeVisible()
})
