import type { Page } from '@playwright/test'

/** Upload a .waosrec via the hidden file input and wait for the debugger shell. */
export async function uploadWaosrec(page: Page, absolutePath: string) {
  const input = page.locator('[data-testid="waosrec-upload"] input[type="file"]')
  await input.setInputFiles(absolutePath)
  await page.getByTestId('recording-debugger').waitFor({ state: 'visible', timeout: 120_000 })
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
