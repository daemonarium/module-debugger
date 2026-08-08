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

  test('M02 Step on Messages advances to next message', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await page.getByTestId('tab-messages').click()

    const rows = page.getByTestId('message-row')
    await expect(rows.first()).toBeVisible()
    const firstId = await rows.first().getAttribute('data-message-id')
    await page.getByTestId('btn-reset').click()
    await expect(rows.first()).toHaveClass(/bg-blue-100/)

    await page.getByTestId('btn-step').click()
    const selected = page.locator('[data-testid="message-row"].bg-blue-100')
    await expect(selected).toBeVisible()
    const nextId = await selected.getAttribute('data-message-id')
    expect(nextId).not.toBe(firstId)
    await expect(page.getByTestId('scrubber-index')).toContainText('messages')
  })

  test('M03 Messages list shows request_id and method summary', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await page.getByTestId('tab-messages').click()

    const rows = page.getByTestId('message-row')
    await expect(rows.first()).toBeVisible()
    
    // Find a request row
    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="out"][data-request-id]').first()
    await expect(reqRow).toBeVisible()
    
    // The summary should contain the method name 'echo'
    const reqText = await reqRow.innerText()
    expect(reqText).toContain('echo')
  })

  test('M04 Messages detail shows ValueTree for RPC params and return', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await page.getByTestId('tab-messages').click()

    // Click request
    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="out"][data-request-id]').first()
    await reqRow.click()
    
    // Detail should show Request Arguments
    const detail = page.getByTestId('message-detail')
    await expect(detail).toContainText('Request Arguments')
    
    // Verify ValueTree is rendered (data-testid="value-tree")
    await expect(detail.getByTestId('value-tree').first()).toBeVisible()

    // Click matching response
    const reqId = await reqRow.getAttribute('data-request-id')
    const resRow = page.locator(`[data-testid="message-row"][data-message-dir="in"][data-request-id="${reqId}"]`).first()
    await resRow.click()

    // Detail should show Return Value
    await expect(detail).toContainText('Return Value')
    await expect(detail.getByTestId('value-tree').first()).toBeVisible()
  })

  test('M05 Color-coding links request and response', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await page.getByTestId('tab-messages').click()

    const reqRow = page.locator('[data-testid="message-row"][data-message-dir="out"][data-request-id]').first()
    await expect(reqRow).toBeVisible()
    const reqId = await reqRow.getAttribute('data-request-id')
    const resRow = page.locator(`[data-testid="message-row"][data-message-dir="in"][data-request-id="${reqId}"]`).first()
    
    // Compare classes that contain borders/backgrounds for coloring
    const reqClass = await reqRow.getAttribute('class')
    const resClass = await resRow.getAttribute('class')
    
    // They both should have border-l-4
    expect(reqClass).toContain('border-l-4')
    expect(resClass).toContain('border-l-4')
    
    // Find the dynamic color class (e.g. bg-blue-50) by extracting it
    // Exclude the selection classes (bg-primary-100, etc)
    const reqColors = reqClass?.split(' ').filter(c => c.startsWith('bg-') && !c.includes('primary'))
    const resColors = resClass?.split(' ').filter(c => c.startsWith('bg-') && !c.includes('primary'))
    
    expect(reqColors?.length).toBeGreaterThan(0)
    expect(reqColors).toEqual(resColors)
  })
})
