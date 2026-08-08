import { test, expect } from '@playwright/test'
import { switchMode } from './helpers/recording'

test.describe('C1 Recording shell', () => {
  test('R01 default Recording mode shows source', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mode-select')).toBeVisible()
    await expect(page.getByTestId('recording-source')).toBeVisible()
    await expect(page.getByText('Open recording dump')).toBeVisible()
  })

  test('R02 switch to Interactive', async ({ page }) => {
    await page.goto('/')
    await switchMode(page, 'Interactive')
    await expect(page.getByText('Load WebAssembly Module')).toBeVisible()
  })

  test('R03 back to Recording clears debugger', async ({ page }) => {
    await page.goto('/')
    await switchMode(page, 'Interactive')
    await switchMode(page, 'Recording')
    await expect(page.getByTestId('recording-source')).toBeVisible()
    await expect(page.getByTestId('recording-debugger')).toHaveCount(0)
  })
})
