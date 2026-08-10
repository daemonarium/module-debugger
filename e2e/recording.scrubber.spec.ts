import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec } from './helpers/upload'
import {
  readScrubberIndex,
  readExpectMatches,
  step,
  run,
  reset,
  seekSlider,
  waitIdle,
} from './helpers/recording'

test.describe('C4 Scrubber', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
  })

  test('R30 Step increments index by 1', async ({ page }) => {
    const before = await readScrubberIndex(page)
    await step(page)
    const after = await readScrubberIndex(page)
    expect(after.index).toBe(before.index + 1)
  })

  test('R31 Reset returns to 0', async ({ page }) => {
    await step(page)
    await reset(page)
    const { index, total } = await readScrubberIndex(page)
    expect(index).toBe(0)
    expect(total).toBeGreaterThan(0)
  })

  test('R32 seek mid via slider', async ({ page }) => {
    const { total } = await readScrubberIndex(page)
    const target = Math.max(1, Math.floor(total / 2))
    await seekSlider(page, target)
    await waitIdle(page)
    const after = await readScrubberIndex(page)
    // Slider click is approximate; allow ±2
    expect(Math.abs(after.index - target)).toBeLessThanOrEqual(2)
    await expect(page.getByTestId('scrubber-busy')).toHaveCount(0)
  })

  test('R33 Run produces expect matches and disables at end', async ({ page }) => {
    await run(page)
    const matches = await readExpectMatches(page)
    expect(matches).toBeGreaterThanOrEqual(1)
    const { index, total } = await readScrubberIndex(page)
    // Messages/Events scrubber sits on the last unit (0-based): index === total - 1
    expect(index).toBe(total - 1)
    await expect(page.getByTestId('btn-step')).toBeDisabled()
    await expect(page.getByTestId('btn-run')).toBeDisabled()
  })

  test('R34 after Run seek(0) resets matches', async ({ page }) => {
    await run(page)
    expect(await readExpectMatches(page)).toBeGreaterThanOrEqual(1)
    await seekSlider(page, 0)
    await waitIdle(page)
    const { index } = await readScrubberIndex(page)
    expect(index).toBeLessThanOrEqual(1)
    expect(await readExpectMatches(page)).toBeLessThanOrEqual(1)
  })

  test('R35 Step disabled at end', async ({ page }) => {
    await run(page)
    await expect(page.getByTestId('btn-step')).toBeDisabled()
  })
})
