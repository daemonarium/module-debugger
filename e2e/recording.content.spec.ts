import { test, expect, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import {
  loadManifest,
  requireWaosrec,
  replayableFixtures,
  waosrecPath,
} from './fixtures'
import { uploadWaosrec } from './helpers/upload'
import {
  clickTimelineRow,
  run,
  readExpectMatches,
} from './helpers/recording'
import {
  loadOracle,
  formatHexPreview,
  countByClass,
  expectFrameCount,
  ECHO_HELLO_HEX,
  ECHO_BINARY_HEX,
  type Oracle,
} from './helpers/oracle'

test.describe.configure({ mode: 'serial' })

async function assertTimelineMatchesOracle(page: Page, oracle: Oracle) {
  const rows = page.getByTestId('timeline-row')
  await expect(rows).toHaveCount(oracle.frames.length)

  const counts = countByClass(oracle.frames)
  for (const cls of ['stimulus', 'expect', 'topology'] as const) {
    const expected = counts[cls] ?? 0
    const actual = await page.locator(
      `[data-testid="timeline-row"][data-frame-class="${cls}"]`
    ).count()
    expect(actual, `class ${cls} count`).toBe(expected)
  }
}

async function assertFrameDetailMatches(
  page: Page,
  oracle: Oracle,
  index: number
) {
  const frame = oracle.frames[index]!
  await clickTimelineRow(page, index)
  await expect(page.getByTestId('frame-type-name')).toHaveText(frame.typeName)
  const classEl = page.getByTestId('frame-class')
  if ((await classEl.count()) > 0) {
    await expect(classEl).toContainText(frame.class)
  } else {
    await expect(page.getByTestId('frame-detail')).toContainText(frame.class)
  }
  const row = page.locator(
    `[data-testid="timeline-row"][data-frame-index="${index}"]`
  )
  await expect(row).toHaveAttribute('data-frame-class', frame.class)

  const hex = (await page.getByTestId('hex-preview').innerText()).trim()
  expect(hex).toBe(formatHexPreview(frame.payload))

  const lenCell = await row.locator('td').nth(4).innerText()
  expect(Number(lenCell)).toBe(frame.payload.length)
}

async function assertExactExpectMatches(page: Page, oracle: Oracle) {
  await run(page)
  await expect(page.getByTestId('replay-error')).toHaveCount(0)
  expect(await readExpectMatches(page)).toBe(expectFrameCount(oracle.frames))
}

test.describe('C11 Content fidelity — dbg_echo', () => {
  test('R80 timeline row count matches oracle', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    const oracle = loadOracle('dbg_echo')
    await page.goto('/')
    await uploadWaosrec(page, path)
    await expect(page.getByTestId('timeline-row')).toHaveCount(oracle.frames.length)
  })

  test('R81 class counts match oracle', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    const oracle = loadOracle('dbg_echo')
    await page.goto('/')
    await uploadWaosrec(page, path)
    await assertTimelineMatchesOracle(page, oracle)
  })

  test('R82 sampled frames: typeName + class match oracle', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    const oracle = loadOracle('dbg_echo')
    await page.goto('/')
    await uploadWaosrec(page, path)

    const indices = new Set<number>()
    indices.add(0)
    indices.add(Math.floor(oracle.frames.length / 2))
    indices.add(oracle.frames.length - 1)
    for (let i = 0; i < oracle.frames.length; i++) {
      if (oracle.frames[i]!.class === 'expect') indices.add(i)
    }

    for (const i of [...indices].sort((a, b) => a - b)) {
      const frame = oracle.frames[i]!
      await clickTimelineRow(page, i)
      await expect(page.getByTestId('frame-type-name')).toHaveText(frame.typeName)
      const row = page.locator(
        `[data-testid="timeline-row"][data-frame-index="${i}"]`
      )
      await expect(row).toHaveAttribute('data-frame-class', frame.class)
      const classEl = page.getByTestId('frame-class')
      if ((await classEl.count()) > 0) {
        await expect(classEl).toContainText(frame.class)
      }
    }
  })

  test('R83 hex preview matches oracle for payload frames', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    const oracle = loadOracle('dbg_echo')
    await page.goto('/')
    await uploadWaosrec(page, path)

    const withPayload = oracle.frames
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.payload.length > 0)
      .slice(0, 6)

    expect(withPayload.length).toBeGreaterThan(0)
    for (const { i } of withPayload) {
      await assertFrameDetailMatches(page, oracle, i)
    }
  })

  test('R84 golden echo payloads visible in hex', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    const oracle = loadOracle('dbg_echo')
    await page.goto('/')
    await uploadWaosrec(page, path)

    let sawHello = false
    let sawBinary = false
    for (let i = 0; i < oracle.frames.length; i++) {
      const frame = oracle.frames[i]!
      if (frame.payload.length === 0) continue
      const expectedHex = formatHexPreview(frame.payload)
      if (expectedHex.includes(ECHO_HELLO_HEX) || expectedHex === ECHO_HELLO_HEX) {
        await clickTimelineRow(page, i)
        const hex = (await page.getByTestId('hex-preview').innerText()).trim()
        expect(hex).toContain(ECHO_HELLO_HEX)
        sawHello = true
      }
      if (expectedHex.includes(ECHO_BINARY_HEX)) {
        await clickTimelineRow(page, i)
        const hex = (await page.getByTestId('hex-preview').innerText()).trim()
        expect(hex).toContain(ECHO_BINARY_HEX)
        sawBinary = true
      }
    }
    expect(sawHello, 'oracle should contain hello-fixture payload').toBe(true)
    expect(sawBinary, 'oracle should contain DE AD BE EF payload').toBe(true)

    const copyIdx = oracle.frames.findIndex(
      (f) =>
        (f.class === 'stimulus' || f.class === 'expect') &&
        f.payload.length > 0 &&
        f.typeName.includes('copy')
    )
    if (copyIdx >= 0) {
      await clickTimelineRow(page, copyIdx)
      const block = page.getByTestId('decode-block')
      const warn = page.getByTestId('decode-warn')
      if ((await block.count()) > 0) {
        await expect(page.getByTestId('decode-msg-json').first()).not.toHaveText('')
        await expect(page.getByTestId('hex-preview')).toHaveText(
          formatHexPreview(oracle.frames[copyIdx]!.payload)
        )
      } else {
        await expect(warn).toBeVisible()
      }
    }
  })

  test('R85 Run expect-matches equals oracle expect count', async ({ page }) => {
    const path = requireWaosrec('dbg_echo')
    const oracle = loadOracle('dbg_echo')
    expect(expectFrameCount(oracle.frames)).toBeGreaterThan(0)
    await page.goto('/')
    await uploadWaosrec(page, path)
    await assertExactExpectMatches(page, oracle)
  })
})

test.describe('C11 Content fidelity — all fixtures', () => {
  const fixtures = replayableFixtures(loadManifest())

  for (const f of fixtures) {
    test(`R86 ${f.id} rows + classes + exact matches`, async ({ page }) => {
      test.setTimeout(120_000)
      const path = requireWaosrec(f.id)
      const oracle = loadOracle(f.id)
      await page.goto('/')
      await uploadWaosrec(page, path)
      await assertTimelineMatchesOracle(page, oracle)
      await assertExactExpectMatches(page, oracle)
    })
  }

  test('R87 topology frames match oracle', async ({ page }) => {
    const path = waosrecPath('dbg_topology')
    test.skip(!existsSync(path), 'dbg_topology.waosrec missing')
    const oracle = loadOracle('dbg_topology')
    const topoCount = countByClass(oracle.frames).topology ?? 0
    expect(topoCount).toBeGreaterThanOrEqual(1)

    await page.goto('/')
    await uploadWaosrec(page, path)
    await expect(
      page.locator('[data-testid="timeline-row"][data-frame-class="topology"]')
    ).toHaveCount(topoCount)

    const firstTopo = oracle.frames.findIndex((fr) => fr.class === 'topology')
    expect(firstTopo).toBeGreaterThanOrEqual(0)
    await clickTimelineRow(page, firstTopo)
    const typeName = oracle.frames[firstTopo]!.typeName
    await expect(page.getByTestId('frame-type-name')).toHaveText(typeName)
    expect(typeName).toMatch(/bind|process_bind/i)
  })
})
