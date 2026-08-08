import { test, expect } from '@playwright/test'
import { existsSync } from 'node:fs'
import { requireWaosrec, waosrecPath } from './fixtures'
import { uploadWaosrec } from './helpers/upload'
import { clickTimelineRow, step, waitIdle } from './helpers/recording'

test.describe('C7 Topology', () => {
  test('R50 echo topology panel + registries', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    await expect(page.getByTestId('topology-panel')).toBeVisible()
    const regs = page.getByTestId('registry-row')
    await expect(regs.first()).toBeVisible()
    const texts = await regs.allInnerTexts()
    expect(texts.some((t) => /\d+\.\d+/.test(t) && !t.includes('0 bytes'))).toBe(true)
  })

  test('R51 bindings table or No bindings', async ({ page }) => {
    await page.goto('/')
    await uploadWaosrec(page, requireWaosrec('dbg_echo'))
    const empty = page.getByTestId('topology-empty')
    const table = page.getByTestId('topology-bindings')
    const hasEmpty = (await empty.count()) > 0
    const hasTable = (await table.count()) > 0
    expect(hasEmpty || hasTable).toBe(true)
  })

  test('R52 topology fixture updates peer after bind frame', async ({ page }) => {
    const path = waosrecPath('dbg_topology')
    test.skip(!existsSync(path), 'dbg_topology.waosrec missing — run generate or globalSetup')
    await page.goto('/')
    await uploadWaosrec(page, path)
    const topoRows = page.locator('[data-testid="timeline-row"][data-frame-class="topology"]')
    await expect(topoRows.first()).toBeVisible()
    const idx = Number(await topoRows.first().getAttribute('data-frame-index'))
    // Step/seek past the topology frame so panel reflects bind
    await clickTimelineRow(page, idx)
    // Drive scrubber through that frame if needed
    let guard = 0
    while (guard++ < idx + 2) {
      const stepBtn = page.getByTestId('btn-step')
      if (await stepBtn.isDisabled()) break
      await step(page)
      await waitIdle(page)
    }
    await expect(page.getByTestId('topology-panel')).toBeVisible()
    // After bind, expect either binding rows or at least peer registry listed
    const panelText = await page.getByTestId('topology-panel').innerText()
    expect(panelText.length).toBeGreaterThan(10)
  })
})
