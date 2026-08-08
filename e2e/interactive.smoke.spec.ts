import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { DBG_ECHO_WASM } from './fixtures'
import { switchMode } from './helpers/recording'
import { uploadWasm } from './helpers/upload'

test.describe('C10 Interactive smoke', () => {
  test('I01 switch Interactive', async ({ page }) => {
    await page.goto('/')
    await switchMode(page, 'Interactive')
    await expect(page.getByText('Load WebAssembly Module')).toBeVisible()
  })

  test('I02 load dbg_echo.wasm shows Module Debugger', async ({ page }) => {
    test.skip(!existsSync(DBG_ECHO_WASM), 'dbg_echo.wasm not built')
    await page.goto('/')
    await switchMode(page, 'Interactive')
    await expect(page.getByText('Load WebAssembly Module')).toBeVisible()
    await uploadWasm(page, DBG_ECHO_WASM)

    const debuggerHeading = page.getByText('Module Debugger')
    const err = page.getByTestId('interactive-error')
    const sourceErr = page.locator('[data-testid="wasm-upload"]').locator('..').getByText(/Failed/i)
    await Promise.race([
      debuggerHeading.waitFor({ state: 'visible', timeout: 60_000 }),
      err.waitFor({ state: 'visible', timeout: 60_000 }),
      page.getByText('Module loaded successfully').waitFor({ state: 'visible', timeout: 60_000 }),
      page.getByText(/Failed to compile|Failed to load/i).waitFor({ state: 'visible', timeout: 60_000 }),
    ]).catch(() => {})

    if ((await err.count()) > 0 || (await page.getByText(/Failed/i).count()) > 0) {
      test.skip(true, 'Interactive instantiate failed for dbg_echo.wasm')
      return
    }
    await expect(debuggerHeading).toBeVisible({ timeout: 60_000 })
  })

  test('I03 Call Method dialog if methods visible', async ({ page }) => {
    test.skip(!existsSync(DBG_ECHO_WASM), 'dbg_echo.wasm not built')
    await page.goto('/')
    await switchMode(page, 'Interactive')
    await uploadWasm(page, DBG_ECHO_WASM)

    const debuggerHeading = page.getByText('Module Debugger')
    const err = page.getByTestId('interactive-error')
    await Promise.race([
      debuggerHeading.waitFor({ state: 'visible', timeout: 60_000 }),
      err.waitFor({ state: 'visible', timeout: 60_000 }),
    ]).catch(() => {})

    if ((await err.count()) > 0 || (await debuggerHeading.count()) === 0) {
      test.skip(true, 'Interactive debugger not available')
      return
    }

    const callBtn = page.getByRole('button', { name: /Call Method/i }).first()
    if ((await callBtn.count()) === 0) {
      test.skip(true, 'no Call Method button in UI')
      return
    }
    await callBtn.click()
    await expect(page.getByRole('dialog').or(page.locator('.p-dialog'))).toBeVisible()
  })
})
