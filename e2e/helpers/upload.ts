import type { Page } from '@playwright/test'

/** Upload a .waosrec via the hidden file input and wait for the debugger shell. */
export async function uploadWaosrec(page: Page, absolutePath: string) {
  const input = page.locator('[data-testid="waosrec-upload"] input[type="file"]')
  await input.setInputFiles(absolutePath)
  await page.getByTestId('recording-debugger').waitFor({ state: 'visible', timeout: 120_000 })
}

/** Default tab is Messages; open Events so timeline-row assertions work. */
export async function openEventsTab(page: Page) {
  await page.getByTestId('tab-events').click()
  await page.getByTestId('timeline').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Upload then switch to the Events timeline tab. */
export async function uploadWaosrecEvents(page: Page, absolutePath: string) {
  await uploadWaosrec(page, absolutePath)
  await openEventsTab(page)
}

/** Upload expecting a source error (no debugger). */
export async function uploadWaosrecExpectError(page: Page, absolutePath: string) {
  const input = page.locator('[data-testid="waosrec-upload"] input[type="file"]')
  await input.setInputFiles(absolutePath)
  await page.getByTestId('source-error').waitFor({ state: 'visible', timeout: 30_000 })
}

export async function uploadWasm(page: Page, absolutePath: string) {
  const input = page.locator('[data-testid="wasm-upload"] input[type="file"]')
  await input.setInputFiles(absolutePath)
}
