import { defineConfig, devices } from '@playwright/test'

const PORT = 5173
const baseURL = `http://127.0.0.1:${PORT}`
const isCI = Boolean(process.env.CI)

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm dev --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
  },
})
