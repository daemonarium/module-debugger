import { test, expect } from '@playwright/test'
import { loadManifest, requireWaosrec, replayableFixtures } from './fixtures'
import { uploadWaosrec } from './helpers/upload'
import { run, readExpectMatches, closeDump } from './helpers/recording'

test.describe.configure({ mode: 'serial' })

test.describe('C6 All fixtures Run', () => {
  const fixtures = replayableFixtures(loadManifest())

  for (const f of fixtures) {
    test(`R44 ${f.id} upload → Run → matches ≥ 1 → Close`, async ({ page }) => {
      test.setTimeout(120_000)
      const path = requireWaosrec(f.id)
      await page.goto('/')
      await uploadWaosrec(page, path)
      await run(page)
      expect(await readExpectMatches(page)).toBeGreaterThanOrEqual(1)
      await closeDump(page)
      await expect(page.getByTestId('recording-source')).toBeVisible()
    })
  }
})
