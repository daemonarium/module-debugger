import { expect, type Page } from '@playwright/test'

export async function waitForDebugger(page: Page) {
  await page.getByTestId('recording-debugger').waitFor({ state: 'visible', timeout: 120_000 })
}

export async function readScrubberIndex(page: Page): Promise<{ index: number; total: number }> {
  const text = (await page.getByTestId('scrubber-index').innerText()).trim()
  const m = /^(\d+)\s*\/\s*(\d+)/.exec(text)
  if (!m) throw new Error(`unexpected scrubber text: ${text}`)
  return { index: Number(m[1]), total: Number(m[2]) }
}

export async function readExpectMatches(page: Page): Promise<number> {
  const text = (await page.getByTestId('expect-matches').innerText()).trim()
  return Number(text)
}

export async function clickTimelineRow(page: Page, index: number) {
  await page.locator(`[data-testid="timeline-row"][data-frame-index="${index}"]`).click()
}

export async function filterSocket(page: Page, value: string) {
  const filter = page.getByTestId('socket-filter')
  await filter.locator('.p-select, .p-dropdown, [role="button"], .p-select-label').first().click()
  await page.getByRole('option', { name: value, exact: true }).click()
}

export async function step(page: Page) {
  await page.getByTestId('btn-step').click()
  await waitIdle(page)
}

export async function run(page: Page) {
  await page.getByTestId('btn-run').click()
  await waitIdle(page)
}

export async function reset(page: Page) {
  await page.getByTestId('btn-reset').click()
  await waitIdle(page)
}

export async function waitIdle(page: Page) {
  const busy = page.getByTestId('scrubber-busy')
  await expect(busy).toHaveCount(0, { timeout: 120_000 })
}

/** Seek via slider track click (fraction of max). */
export async function seekSlider(page: Page, index: number) {
  const { total } = await readScrubberIndex(page)
  const slider = page.getByTestId('scrubber').locator('.p-slider').first()
  const box = await slider.boundingBox()
  if (!box) throw new Error('slider not visible')
  const max = Math.max(total, 1)
  const ratio = Math.min(Math.max(index / max, 0), 1)
  const x = box.x + box.width * ratio
  const y = box.y + box.height / 2
  await page.mouse.click(x, y)
  await waitIdle(page)
}

export async function closeDump(page: Page) {
  await page.getByTestId('close-dump').click()
  await page.getByTestId('recording-source').waitFor({ state: 'visible' })
}

/** No-op: Interactive mode switch was removed from the app shell. */
export async function switchMode(_page: Page, _label: 'Recording' | 'Interactive') {
  // Interactive UI is hidden; Recording is the only path.
}
