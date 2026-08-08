import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { SESSION_ECHO_DIR } from '../fixtures'

/** Build a File System Access–style directory handle from a real session folder. */
export function loadSessionFilesAsBase64(sessionDir: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of readdirSync(sessionDir)) {
    const bytes = readFileSync(join(sessionDir, name))
    out[name] = Buffer.from(bytes).toString('base64')
  }
  return out
}

/**
 * Mock showDirectoryPicker to return files from the cached echo session.
 * Call before page.goto.
 */
export async function stubSessionDirectoryPicker(
  page: Page,
  sessionDir: string = SESSION_ECHO_DIR
) {
  const files = loadSessionFilesAsBase64(sessionDir)
  await page.addInitScript((fileMap: Record<string, string>) => {
    ;(window as any).showDirectoryPicker = async () => {
      return {
        async *entries() {
          for (const [name, b64] of Object.entries(fileMap)) {
            const binary = atob(b64)
            const bytes = new Uint8Array(binary.length)
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
            yield [
              name,
              {
                kind: 'file' as const,
                async getFile() {
                  return new File([bytes], name)
                },
              },
            ] as const
          }
        },
      }
    }
  }, files)
}

/** Remove File System Access API before the app boots. */
export async function stubNoDirectoryPicker(page: Page) {
  await page.addInitScript(() => {
    try {
      delete (window as any).showDirectoryPicker
    } catch {
      ;(window as any).showDirectoryPicker = undefined
    }
  })
}
