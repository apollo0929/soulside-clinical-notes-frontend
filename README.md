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

In development, the app bootstraps the MSW mock backend once and seeds the default
dataset (`seed: 42`, `noteCount: 48`) via `POST /api/dev/seed`. The active list actor is
the fixed reviewer `usr_reviewer_42_0` (headers via the API client actor provider).
Bulk assign/regenerate require the ADMIN actor (`usr_admin_42`); in DEV the actor
API is exposed on `globalThis.__SOULSIDE_ACTOR__` for tests/role switching.

### Notes list

- Route: [`/notes`](http://localhost:5173/notes)
- Filters/sort live in the URL. Examples:
  - `/notes?status=APPROVED,IN_REVIEW`
  - `/notes?q=avery&sort=patientDisplayName&direction=asc`
  - `/notes?reviewer=usr_reviewer_42_0&from=2024-06-01T00:00:00.000Z`
- Selection is page-local (not URL). “Select all” covers loaded visible rows only.
- Bulk assign (ADMIN): sets reviewer without changing status; partial success supported.
- Bulk regenerate (ADMIN): `FAILED → GENERATING` via lifecycle; partial success supported.
- Failed items stay selected; successful items are deselected.
- Focused unit tests: `pnpm test -- src/features/notes-list src/services/api src/mock/services/bulk-actions.test.ts`
- Playwright: `pnpm test:e2e -- e2e/notes-list.spec.ts e2e/notes-bulk.spec.ts`

### Note detail (Steps 7A–9)

- Route: `/notes/:noteId` (patient name links from the list preserve list URL filters via navigation state).
- Shows SOAP content, version history, word-level SOAP diff for any two selected versions, and review timeline.
- Lifecycle actions are presented as a read-only availability summary (no transition mutations yet).
- Version bodies are fetched on demand for selected historical versions only.
- **SOAP editor (7B):** read-only by default. When access allows, **Edit note** opens a draft editor.
  - Editable when `NOTE_EDIT` + version-save policy allow: `IN_REVIEW` (assigned reviewer/ADMIN), `REJECTED`/`AMENDED` (owning clinician/ADMIN).
  - Dirty tracking is per SOAP section with exact string equality (whitespace matters).
  - Discard restores the initial version content and exits edit mode after confirmation.
- **Autosave (8):** 700ms debounce; note-scoped serialized saves (one in-flight, one coalesced follow-up).
  - Status: No local changes → Waiting to save… → Saving… / queued follow-up → Saved (or retryable/non-retryable error / conflict).
  - Retries reuse the same `clientMutationId`; follow-ups get a new id and advanced `baseVersionId`.
  - Version conflicts preserve the local draft and stop autosave.
  - Navigation stays guarded while dirty or while a save is unacked.
- **Three-way conflict resolution (9):** hydrate server head + common ancestor; classify each SOAP section;
  auto-merge non-conflicts; explicit Keep mine / Use server / Manual merge for true conflicts (no clinical concatenation).
  - Resolve and save uses the **server head** as `baseVersionId` and a **new** `clientMutationId`.
  - A resolve that itself 409s opens a new session with the just-resolved content as the local side (no auto-retry).
  - Ordinary editor stays frozen while resolving; offline replay is not implemented yet.
- Playwright: `pnpm test:e2e -- e2e/notes-detail.spec.ts e2e/notes-editor.spec.ts e2e/notes-conflict.spec.ts`

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
- `GET /api/notes/:noteId/versions/:versionId`
- `POST /api/dev/seed`
- `POST /api/notes/:id/transitions`
- `POST /api/notes/:id/versions`
- `POST /api/notes/bulk/assign-reviewer`
- `POST /api/notes/bulk/regenerate`

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
