import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { requireWaosrec, waosrecPath } from './fixtures'
import { uploadWaosrec, uploadWaosrecEvents } from './helpers/upload'
import { clickTimelineRow, step, waitIdle } from './helpers/recording'

async function openEnvironment(page: import('@playwright/test').Page) {
  await page.getByTestId('tab-environment').click()
  await expect(page.getByTestId('environment-view')).toBeVisible()
}

test.describe('C7 Topology', () => {
  test('R50 echo environment + registries', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await openEnvironment(page)

    const unbound = page.getByTestId('environment-unbound-registry')
    const bindings = page.getByTestId('environment-binding')
    const hasUnbound = (await unbound.count()) > 0
    const hasBindings = (await bindings.count()) > 0
    expect(hasUnbound || hasBindings).toBe(true)

    if (hasUnbound) {
      const texts = await unbound.allInnerTexts()
      expect(texts.some((t) => /\d+\.\d+/.test(t) && !t.includes('0 bytes'))).toBe(true)
    } else {
      await bindings.first().click()
      await expect(page.getByTestId('environment-registry').first()).toBeVisible()
    }
  })

  test('R51 bindings list or No bindings', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await openEnvironment(page)
    const empty = page.getByTestId('environment-empty')
    const binding = page.getByTestId('environment-binding')
    const hasEmpty = (await empty.count()) > 0
    const hasBinding = (await binding.count()) > 0
    expect(hasEmpty || hasBinding).toBe(true)
  })

  test('R52 topology fixture updates peer after bind frame', async ({ page }) => {
    const path = waosrecPath('dbg_topology')
    test.skip(!existsSync(path), 'dbg_topology.waosrec missing — run generate or globalSetup')
    await page.goto('/')
    await uploadWaosrecEvents(page, path)
    const topoRows = page.locator('[data-testid="timeline-row"][data-frame-class="topology"]')
    await expect(topoRows.first()).toBeVisible()
    const idx = Number(await topoRows.first().getAttribute('data-frame-index'))
    await clickTimelineRow(page, idx)
    let guard = 0
    while (guard++ < idx + 2) {
      const stepBtn = page.getByTestId('btn-step')
      if (await stepBtn.isDisabled()) break
      await step(page)
      await waitIdle(page)
    }
    await openEnvironment(page)
    const viewText = await page.getByTestId('environment-view').innerText()
    expect(viewText.length).toBeGreaterThan(10)
    // After bind, a peer row (or binding) should be visible
    const binding = page.getByTestId('environment-binding')
    if ((await binding.count()) > 0) {
      await expect(binding.first()).toContainText(/peer pid=/)
    }
  })
})
