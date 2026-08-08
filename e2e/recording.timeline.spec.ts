import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec } from './helpers/upload'
import { clickTimelineRow } from './helpers/recording'

test.describe('C3 Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
  })

  test('R20 has stimulus and expect tags', async ({ page }) => {
    await expect(
      page.locator('[data-testid="timeline-row"][data-frame-class="stimulus"]').first()
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="timeline-row"][data-frame-class="expect"]').first()
    ).toBeVisible()
  })

  test('R21 socket filter reduces count', async ({ page }) => {
    const before = (await page.getByTestId('timeline-count').innerText()).trim()
    const [n0] = before.split('/').map((s) => Number(s.trim()))
    // Pick a concrete socket option other than All if available
    const filter = page.getByTestId('socket-filter')
    await filter.locator('.p-select, [role="button"], .p-select-label, .p-dropdown').first().click()
    const options = page.getByRole('option')
    const count = await options.count()
    let filtered = false
    for (let i = 0; i < count; i++) {
      const label = (await options.nth(i).innerText()).trim()
      if (label !== 'All') {
        await options.nth(i).click()
        filtered = true
        break
      }
    }
    test.skip(!filtered, 'no non-All socket options')
    const after = (await page.getByTestId('timeline-count').innerText()).trim()
    const [n1] = after.split('/').map((s) => Number(s.trim()))
    expect(n1).toBeLessThanOrEqual(n0!)
    expect(after).toMatch(/\d+\s*\/\s*\d+/)
  })

  test('R22 click row shows typeName in detail', async ({ page }) => {
    const row = page.getByTestId('timeline-row').first()
    const typeName = (await row.getByTestId('timeline-type').innerText()).trim()
    await row.click()
    await expect(page.getByTestId('frame-type-name')).toHaveText(typeName)
  })

  test('R23 Copy payload shows non-empty hex', async ({ page }) => {
    const copyRow = page
      .locator('[data-testid="timeline-row"]')
      .filter({ hasText: /Copy|process_copy/i })
      .first()
    if ((await copyRow.count()) === 0) {
      // Fall back: first stimulus/expect with payload length > 0
      const rows = page.getByTestId('timeline-row')
      const n = await rows.count()
      let clicked = false
      for (let i = 0; i < n; i++) {
        const lenText = await rows.nth(i).locator('td').nth(4).innerText()
        if (Number(lenText) > 0) {
          await rows.nth(i).click()
          clicked = true
          break
        }
      }
      expect(clicked).toBe(true)
    } else {
      await copyRow.click()
    }
    const hex = (await page.getByTestId('hex-preview').innerText()).trim()
    expect(hex).not.toBe('(empty)')
  })
})

test.describe('C3 Timeline empty payload', () => {
  test('R24 hello frame can show empty hex', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_hello'))
    const rows = page.getByTestId('timeline-row')
    const n = await rows.count()
    let foundEmpty = false
    for (let i = 0; i < n; i++) {
      const lenText = await rows.nth(i).locator('td').nth(4).innerText()
      if (Number(lenText) === 0) {
        await rows.nth(i).click()
        foundEmpty = true
        break
      }
    }
    if (!foundEmpty) {
      await clickTimelineRow(page, 0)
    }
    await expect(page.getByTestId('hex-pane')).toBeVisible()
    // either empty or some bytes — must not crash
    await expect(page.getByTestId('hex-preview')).toBeVisible()
  })
})
