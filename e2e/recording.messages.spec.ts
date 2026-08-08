import { test, expect } from '@playwright/test'
import { requireWaosrec } from './fixtures'
import { uploadWaosrec } from './helpers/upload'

test.describe('Messages stream tab', () => {
  test('M00 default tab is Messages with splitter', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    await expect(page.getByTestId('message-stream')).toBeVisible()
    await expect(page.getByTestId('messages-splitter')).toBeVisible()
    await expect(page.getByTestId('message-display-toggles')).toBeVisible()
  })

  test('M01 Messages tab shows IN/OUT, detail hex, jump to Events', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

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

  test('M02 Step on Messages advances to next message', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const rows = page.getByTestId('message-row')
    await expect(rows.first()).toBeVisible()
    const firstId = await rows.first().getAttribute('data-message-id')
    await page.getByTestId('btn-reset').click()
    await expect(rows.first()).toHaveClass(/bg-primary-100/)

    await page.getByTestId('btn-step').click()
    const selected = page.locator('[data-testid="message-row"].bg-primary-100')
    await expect(selected).toBeVisible()
    const nextId = await selected.getAttribute('data-message-id')
    expect(nextId).not.toBe(firstId)
    await expect(page.getByTestId('scrubber-index')).toContainText('messages')
  })

  test('M03 Messages list shows request_id and method summary', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const rows = page.getByTestId('message-row')
    await expect(rows.first()).toBeVisible()

    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="in"][data-request-id]').first()
    await expect(reqRow).toBeVisible()

    const reqText = await reqRow.innerText()
    expect(reqText).toContain('echo')
  })

  test('M04 Messages detail shows ValueTree for RPC params and return', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="in"][data-request-id]').first()
    await reqRow.click()

    const detail = page.getByTestId('message-detail')
    await expect(detail).toContainText('Request Arguments')
    await expect(detail.getByTestId('value-tree').first()).toBeVisible()

    const reqId = await reqRow.getAttribute('data-request-id')
    const resRow = page.locator(`[data-testid="message-row"][data-message-dir="out"][data-request-id="${reqId}"]`).first()
    await resRow.click()

    await expect(detail).toContainText('Return Value')
    await expect(detail.getByTestId('value-tree').first()).toBeVisible()
  })

  test('M05 Color-coding links request and response', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="in"][data-request-id]').first()
    await expect(reqRow).toBeVisible()
    const reqId = await reqRow.getAttribute('data-request-id')
    const resRow = page.locator(`[data-testid="message-row"][data-message-dir="out"][data-request-id="${reqId}"]`).first()

    const reqClass = await reqRow.getAttribute('class')
    const resClass = await resRow.getAttribute('class')

    expect(reqClass).toContain('border-l-4')
    expect(resClass).toContain('border-l-4')

    const reqColors = reqClass?.split(' ').filter(c => c.startsWith('bg-') && !c.includes('primary'))
    const resColors = resClass?.split(' ').filter(c => c.startsWith('bg-') && !c.includes('primary'))

    expect(reqColors?.length).toBeGreaterThan(0)
    expect(reqColors).toEqual(resColors)
  })

  test('M06 Request detail shows paired response and jump selects it', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="in"][data-request-id]').first()
    await reqRow.click()

    const detail = page.getByTestId('message-detail')
    await expect(detail.getByTestId('paired-response-section')).toContainText('Response to this request')
    await expect(detail.getByTestId('jump-to-response')).toBeVisible()

    const reqId = await reqRow.getAttribute('data-request-id')
    const resRow = page.locator(`[data-testid="message-row"][data-message-dir="out"][data-request-id="${reqId}"]`).first()
    const resId = await resRow.getAttribute('data-message-id')

    await detail.getByTestId('jump-to-response').click()
    await expect(page.locator(`[data-testid="message-row"][data-message-id="${resId}"]`)).toHaveClass(/bg-primary-100/)
    await expect(detail.getByTestId('paired-request-section')).toContainText('Request for this response')
    await expect(detail.getByTestId('jump-to-request')).toBeVisible()

    await detail.getByTestId('jump-to-request').click()
    const reqMsgId = await reqRow.getAttribute('data-message-id')
    await expect(page.locator(`[data-testid="message-row"][data-message-id="${reqMsgId}"]`)).toHaveClass(/bg-primary-100/)
  })

  test('M07 socket click opens Environment expanded binding', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const sockLink = page.getByTestId('message-socket-link').first()
    await sockLink.click()

    await expect(page.getByTestId('environment-view')).toBeVisible()
    const expanded =
      page.locator('[data-testid="environment-binding"][data-expanded="1"]')
        .or(page.locator('[data-testid="environment-unbound-registry"][data-expanded="1"]'))
    await expect(expanded.first()).toBeVisible()
  })

  test('M08 method click opens Environment and highlights method', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const method = page.locator('[data-testid="message-row"][data-message-dir="in"] [data-testid="method-name"]').first()
    await expect(method).toBeVisible()
    await method.click()

    await expect(page.getByTestId('environment-view')).toBeVisible()
    await expect(page.getByTestId('environment-view')).toContainText('echo')
    await expect(
      page.getByTestId('api-method-row').filter({ hasText: 'echo' }).first()
    ).toBeVisible()
  })

  test('M09 Show responses toggle hides response rows', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const countBefore = await page.getByTestId('message-count').innerText()
    const outBefore = await page.locator('[data-testid="message-row"][data-message-dir="out"]').count()
    expect(outBefore).toBeGreaterThan(0)

    // PrimeVue ToggleSwitch — click the visible switch root
    await page.getByTestId('toggle-responses').locator('.p-toggleswitch').click()

    await expect
      .poll(async () => page.locator('[data-testid="message-row"][data-message-dir="out"]').count())
      .toBe(0)
    const countAfter = await page.getByTestId('message-count').innerText()
    expect(countAfter).not.toBe(countBefore)
  })

  test('M10 Debug on IN message seeks past Data without crash', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    const inRow = page.locator('[data-testid="message-row"][data-message-dir="in"]').first()
    await inRow.click()
    await page.getByTestId('message-debug').first().click()

    const index = await page.evaluate(() => {
      const r = (globalThis as { replay?: { state: { index: number } } }).replay
      return r?.state.index ?? -1
    })
    expect(index).toBeGreaterThan(0)
  })

  test('M11 hash history: navigate then browser back restores tab', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))

    await expect(page.getByTestId('message-stream')).toBeVisible()
    await expect(page).toHaveURL(/tab=messages/)

    const sockLink = page.getByTestId('message-socket-link').first()
    await sockLink.click()
    await expect(page.getByTestId('environment-view')).toBeVisible()
    await expect(page).toHaveURL(/tab=environment/)

    await page.goBack()
    await expect(page.getByTestId('message-stream')).toBeVisible()
    await expect(page).toHaveURL(/tab=messages/)
  })
})
