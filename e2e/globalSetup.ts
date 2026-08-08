import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(__dirname, '..')

function runTsx(scriptRel: string, label: string) {
  const script = join(__dirname, scriptRel)
  const result = spawnSync('npx', ['tsx', script], {
    cwd: pkgRoot,
    encoding: 'utf8',
    stdio: 'inherit',
    env: process.env,
  })
  if (result.status !== 0) {
    console.warn(`[e2e globalSetup] ${label} exited`, result.status)
  }
}

/**
 * prepare-cache (session/bad-echo/topology) then dump-oracles for content fidelity.
 * Both via tsx so recorder/replay resolve like Mocha.
 */
export default async function globalSetup() {
  runTsx('prepare-cache.ts', 'prepare-cache')
  runTsx('../scripts/dump-oracles.ts', 'dump-oracles')
}
