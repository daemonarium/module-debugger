import { test, expect } from '@playwright/test'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { requireWaosrec, SESSION_ECHO_DIR } from './fixtures'
import { uploadWaosrec, uploadWaosrecExpectError } from './helpers/upload'
import { stubSessionDirectoryPicker, stubNoDirectoryPicker } from './helpers/stubs'
import { existsSync } from 'node:fs'

test.describe('C2 Open recording', () => {
  test('R10 upload dbg_echo opens debugger', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    await page.goto('/')
    await uploadWaosrec(page, path)
    await expect(page.getByTestId('recording-debugger')).toBeVisible()
    await expect(page.getByTestId('recording-meta')).toContainText('events=')
    await expect(page.getByTestId('timeline-row').first()).toBeVisible()
  })

  test('R11 garbage bytes show error', async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), 'waosrec-bad-'))
    const bad = join(dir, 'junk.waosrec')
    writeFileSync(bad, Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]))
    await page.goto('/')
    await uploadWaosrecExpectError(page, bad)
    await expect(page.getByTestId('recording-debugger')).toHaveCount(0)
  })

  test('R12 empty file shows error', async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), 'waosrec-empty-'))
    const empty = join(dir, 'empty.waosrec')
    writeFileSync(empty, Buffer.alloc(0))
    await page.goto('/')
    await uploadWaosrecExpectError(page, empty)
    await expect(page.getByTestId('recording-source')).toBeVisible()
  })

  test('R13 session folder via stubbed picker', async ({ page }) => {
    test.skip(!existsSync(join(SESSION_ECHO_DIR, 'io.bin')), 'session-echo cache missing')
    await stubSessionDirectoryPicker(page)
    await page.goto('/')
    await page.getByTestId('session-dir-btn').click()
    await expect(page.getByTestId('recording-debugger')).toBeVisible({ timeout: 120_000 })
    await expect(page.getByTestId('recording-meta')).toContainText('events=')
  })

  test('R14 unsupported directory picker disables button', async ({ page }) => {
    await stubNoDirectoryPicker(page)
    await page.goto('/')
    await expect(page.getByTestId('session-dir-btn')).toBeDisabled()
    await expect(page.getByTestId('session-dir-unsupported')).toBeVisible()
  })
})
