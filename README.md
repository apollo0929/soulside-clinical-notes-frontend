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
  domain/       Domain models, Zod contracts, DTO mappers
  features/     Feature modules (later steps)
  services/     External/service adapters (later steps)
  shared/       Shared UI, hooks, utils
  mock/         Deterministic dummy backend (MSW + in-memory services)
  test/         Test setup, fixtures, helpers
e2e/            Playwright tests
docs/           Design notes
scripts/        Maintenance scripts
```

## Dummy backend (local simulation)

The backend under `src/mock` is a **deterministic local simulation** for development and
tests. It is not a real network service.

### Seeding

Admin-only development seed (MSW):

```http
POST /api/dev/seed
x-user-id: usr_admin_<seed>
x-user-role: ADMIN
Content-Type: application/json

{ "count": 5000, "seed": 12345 }
```

Programmatically:

```ts
import { MockDatabase, seedMockDatabase } from '@/mock'

const db = new MockDatabase()
seedMockDatabase(db, { seed: 12345, noteCount: 5000 })
```

### Test actor headers

Protected endpoints require:

- `x-user-id` — branded user id string
- `x-user-role` — `CLINICIAN` | `REVIEWER` | `ADMIN` | `READONLY_AUDITOR`

There is no real authentication.

### Latency and failure controls

On a `MockBackendService` instance:

```ts
backend.configureForTests() // latency 0, failure rate 0
backend.latency.setRange(100, 800)
backend.failures.setDefaultRate(0.05)
backend.failures.forceAlways()
```

Unit tests should call `configureForTests()` so runs stay fast and deterministic.

### Endpoints (MSW)

- `GET /api/notes`
- `GET /api/notes/:id`
- `POST /api/dev/seed`
- `POST /api/notes/:id/transitions`
- `POST /api/notes/:id/versions`

### Create version

```http
POST /api/notes/:id/versions
x-user-id: usr_...
x-user-role: REVIEWER
Content-Type: application/json

{
  "baseVersionId": "ver_...",
  "content": { "sections": { "S": "...", "O": "...", "A": "...", "P": "..." } },
  "clientMutationId": "mut_..."
}
```

- Success **200** returns `{ version: { id, revision, parentVersionId } }`.
- Stale `baseVersionId` returns **409** with the existing `version_conflict` body.
- Reusing `clientMutationId` with the same fingerprint replays the prior success.
- Reusing the key with a different fingerprint returns **409** `IDEMPOTENCY_KEY_REUSED`.

Tests use `MockBackendService`’s fixed clock (`setNow` / `clock.now()`). Application
services never call `Date.now()`.

See `docs/architecture.md` (Dummy Backend / Version Creation) for cursor design, sorting,
authorization, and concurrency semantics.

Unit tests cover branded IDs, status/role enums, SOAP and API DTO schemas, DTO→domain
mappers, lifecycle, authorization, and the dummy backend.

## License

Private — assessment use only.
