import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec, uploadWaosrecEvents } from './helpers/upload'

async function selectPayloadFrame(page: import('@playwright/test').Page) {
  const rows = page.getByTestId('timeline-row')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const cls = await rows.nth(i).getAttribute('data-frame-class')
    const len = Number(await rows.nth(i).locator('td').nth(4).innerText())
    if ((cls === 'stimulus' || cls === 'expect') && len > 0) {
      await rows.nth(i).click()
      return
    }
  }
  await rows.first().click()
}

test.describe('C5 Decode', () => {
  test('R40 hex visible for payload frame', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrecEvents(page, requireWaosrec('dbg_echo'))
    await selectPayloadFrame(page)
    const hex = (await page.getByTestId('hex-preview').innerText()).trim()
    expect(hex).not.toBe('(empty)')
  })

  test('R41 decode-block or warn present', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrecEvents(page, requireWaosrec('dbg_echo'))
    await selectPayloadFrame(page)
    const block = page.getByTestId('decode-block')
    const warn = page.getByTestId('decode-warn')
    const hasBlock = (await block.count()) > 0
    const hasWarn = (await warn.count()) > 0
    expect(hasBlock || hasWarn).toBe(true)
  })

  test('R42 Registry key label present', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrecEvents(page, requireWaosrec('dbg_echo'))
    await selectPayloadFrame(page)
    await expect(page.getByTestId('registry-key')).toContainText('Registry key:')
  })

  test('R43 stats detail does not crash', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrecEvents(page, requireWaosrec('dbg_stats'))
    await selectPayloadFrame(page)
    await expect(page.getByTestId('frame-detail')).toBeVisible()
    await expect(page.getByTestId('hex-pane')).toBeVisible()
  })
})
