import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

import { srcPathAlias } from './resolve-aliases.ts'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      ...srcPathAlias,
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/main.tsx', 'src/**/*.d.ts'],
    },
  },
})
