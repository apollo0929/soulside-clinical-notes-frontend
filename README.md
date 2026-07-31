# Soulside Clinical Notes — Frontend

Production-oriented React + TypeScript shell for the clinical notes take-home assignment.

## Prerequisites

- **Node.js** `>= 22` (tested with Node 22 LTS)
- **pnpm** `11.x` via [Corepack](https://nodejs.org/api/corepack.html) (recommended)

Enable pnpm with Corepack:

```bash
corepack enable
corepack prepare pnpm@11.18.0 --activate
```

Or install pnpm another way and match the `packageManager` field in `package.json`.

## Installation

```bash
pnpm install
```

For end-to-end tests, install Playwright browsers once:

```bash
pnpm exec playwright install chromium
```

## Local development

```bash
pnpm dev
```

Opens the Vite development server (default `http://localhost:5173`).

## Scripts

| Command              | Description                                          |
| -------------------- | ---------------------------------------------------- |
| `pnpm dev`           | Start Vite dev server                                |
| `pnpm build`         | Typecheck and production build                       |
| `pnpm preview`       | Preview the production build                         |
| `pnpm lint`          | Run ESLint                                           |
| `pnpm lint:fix`      | Run ESLint with autofix                              |
| `pnpm format`        | Format with Prettier                                 |
| `pnpm format:check`  | Check Prettier formatting                            |
| `pnpm typecheck`     | TypeScript project references check                  |
| `pnpm test`          | Run Vitest unit tests once                           |
| `pnpm test:watch`    | Vitest watch mode                                    |
| `pnpm test:coverage` | Vitest with coverage                                 |
| `pnpm test:e2e`      | Playwright (Chromium)                                |
| `pnpm test:e2e:ui`   | Playwright UI mode                                   |
| `pnpm validate`      | format check → lint → typecheck → unit tests → build |

`validate` intentionally omits Playwright so CI/local environments without browsers can still gate quality.

## Playwright

```bash
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:e2e:ui
```

Playwright starts the Vite app automatically via `webServer` in `playwright.config.ts`.

## Project layout

```text
src/
  app/          Application shell, routing, providers
  domain/       Domain models (later steps)
  features/     Feature modules (later steps)
  services/     External/service adapters (later steps)
  shared/       Shared UI, hooks, utils
  mock/         Mock data/APIs (later steps)
  test/         Test setup, fixtures, helpers
e2e/            Playwright tests
docs/           Design notes
scripts/        Maintenance scripts
```

## License

Private — assessment use only.
