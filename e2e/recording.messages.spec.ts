import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec } from './helpers/upload'

test.describe('Messages stream tab', () => {
  test('M01 Messages tab shows IN/OUT, detail hex, jump to Events', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    await page.getByTestId('tab-messages').click()
    await expect(page.getByTestId('message-stream')).toBeVisible()

    const inRow = page.locator('[data-testid="message-row"][data-message-dir="in"]').first()
    const outRow = page.locator('[data-testid="message-row"][data-message-dir="out"]').first()
    await expect(inRow).toBeVisible()
    await expect(outRow).toBeVisible()

    await inRow.click()
    const hex = (
      await page.getByTestId('message-detail').getByTestId('hex-preview').innerText()
    ).trim()
    expect(hex).not.toBe('(empty)')
    await expect(page.getByTestId('message-frame-indices')).not.toHaveText('—')

    const frameIndicesText = (
      await page.getByTestId('message-frame-indices').innerText()
    ).trim()
    const firstFrame = Number(frameIndicesText.split(',')[0]!.trim())
    expect(Number.isFinite(firstFrame)).toBe(true)

    await page.getByTestId('message-show-events').click()
    await expect(page.getByTestId('timeline')).toBeVisible()
    const selected = page.locator(
      `[data-testid="timeline-row"][data-frame-index="${firstFrame}"]`
    )
    await expect(selected).toHaveClass(/bg-blue-100/)
  })
})
