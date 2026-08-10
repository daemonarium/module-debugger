import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec, openEventsTab } from './helpers/upload'
import { readScrubberIndex, closeDump, waitIdle } from './helpers/recording'

test.describe('C9 DevTools / close', () => {
  test('R70 globalThis.replay after load', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    const hasReplay = await page.evaluate(() => !!(globalThis as any).replay)
    expect(hasReplay).toBe(true)
  })

  test('R71 replay.step bumps UI index', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    // Frame-level step only moves the Events scrubber (Messages steps by message).
    await openEventsTab(page)
    const before = await readScrubberIndex(page)
    await page.evaluate(async () => {
      await (globalThis as any).replay.step()
    })
    await expect
      .poll(async () => (await readScrubberIndex(page)).index, { timeout: 60_000 })
      .toBeGreaterThan(before.index)
  })

  test('R72 Close clears replay and shows source', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await closeDump(page)
    const hasReplay = await page.evaluate(() => !!(globalThis as any).replay)
    expect(hasReplay).toBe(false)
    await expect(page.getByTestId('recording-source')).toBeVisible()
  })

  test('R73 reload different dump after close', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await closeDump(page)
    await uploadWaosrec(page, requireWaosrec('dbg_hello'))
    await expect(page.getByTestId('recording-title')).toContainText(/hello|fixture/i)
    await expect(page.getByTestId('replay-error')).toHaveCount(0)
    await waitIdle(page)
  })
})
