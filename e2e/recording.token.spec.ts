import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { requireWaosrec, waosrecPath } from './fixtures'
import { uploadWaosrec } from './helpers/upload'

test.describe('C7b Token / typical topology', () => {
  test('R53 dbg_token Environment shows host, kernel, and kv peer bindings', async ({ page }) => {
    const path = waosrecPath('dbg_token')
    test.skip(!existsSync(path), 'dbg_token.waosrec missing — run generate:recordings')
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_token'))
    await page.getByTestId('tab-environment').click()
    await expect(page.getByTestId('environment-view')).toBeVisible()

    const bindings = page.getByTestId('environment-binding')
    await expect(bindings.first()).toBeVisible()
    expect(await bindings.count()).toBeGreaterThanOrEqual(2)

    const texts = await bindings.allInnerTexts()
    // USER API (host client), KERNEL_API (shield), peer KV socket
    expect(texts.some((t) => /local=0/.test(t))).toBe(true)
    expect(texts.some((t) => /local=1/.test(t) && /peer pid=1/.test(t))).toBe(true)
    expect(texts.some((t) => /local=2/.test(t))).toBe(true)

    const peerRow = bindings.filter({ hasText: /local=2/ }).first()
    await peerRow.click()
    await expect(page.getByTestId('environment-registry').first()).toBeVisible()
    // Peer registry should not be empty for real dbg_kv
    const kvPeer = peerRow.locator('[data-testid="environment-registry"][data-registry-role="peer"]')
    await expect(kvPeer).toBeVisible()
    await expect(kvPeer).not.toContainText('(empty)')

    // Collapse kv row, expand KERNEL_API → shield peer registry must be non-empty
    await peerRow.click()
    const kernelRow = bindings.filter({ hasText: /local=1/ }).first()
    await kernelRow.click()
    const shieldPeer = kernelRow.locator('[data-testid="environment-registry"][data-registry-role="peer"]')
    await expect(shieldPeer).toBeVisible()
    await expect(shieldPeer).not.toContainText('(empty)')
    await expect(shieldPeer).toContainText(/1\.\d+/)
    await expect(shieldPeer.getByTestId('recording-api-browser')).toBeVisible()
  })
})
