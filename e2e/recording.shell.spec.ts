import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec } from './helpers/upload'
import { closeDump } from './helpers/recording'

test.describe('C1 Recording shell', () => {
  test('R01 app shell shows recording source', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await expect(page.getByTestId('mode-select')).toHaveCount(0)
    await expect(page.getByTestId('recording-source')).toBeVisible()
    await expect(page.getByText('Open recording dump')).toBeVisible()
  })

  test('R02 Interactive UI is hidden', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('mode-select')).toHaveCount(0)
    await expect(page.getByText('Load WebAssembly Module')).toHaveCount(0)
  })

  test('R03 dump header + close returns to source', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await expect(page.getByTestId('recording-debugger')).toBeVisible()
    await expect(page.getByTestId('recording-title')).toBeVisible()
    await expect(page.getByTestId('recording-meta')).toBeVisible()
    await expect(page.getByTestId('close-dump')).toBeVisible()
    await closeDump(page)
    await expect(page.getByTestId('recording-source')).toBeVisible()
    await expect(page.getByTestId('recording-debugger')).toHaveCount(0)
  })
})
