import { test, expect } from '@playwright/test'
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BAD_ECHO_PATH } from './fixtures'
import { uploadWaosrec, uploadWaosrecExpectError } from './helpers/upload'
import { run } from './helpers/recording'

test.describe('C8 Errors', () => {
  test('R60 bad-echo Run shows replay-error', async ({ page }) => {
    test.skip(!existsSync(BAD_ECHO_PATH), 'bad-echo.waosrec cache missing')
    await page.goto('/')
    await uploadWaosrec(page, BAD_ECHO_PATH)
    await run(page)
    await expect(page.getByTestId('replay-error')).toBeVisible({ timeout: 120_000 })
  })

  test('R61 non-waosrec content shows source error', async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), 'not-waosrec-'))
    // Must use .waosrec extension so FileUpload accept allows the file; content is not a dump.
    const fake = join(dir, 'notes.waosrec')
    writeFileSync(fake, 'this is not a recording dump')
    await page.goto('/')
    await uploadWaosrecExpectError(page, fake)
    await expect(page.getByTestId('source-error')).toBeVisible()
  })
})
