import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

/** Shared `@/*` → `src/*` alias for Vite and Vitest. */
export const srcPathAlias = {
  '@': path.resolve(rootDir, './src'),
} as const
