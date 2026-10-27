# AGENTS.md

Compact guide for AI agents working in this repo. Full conventions live in `AI_DEVELOPMENT_GUIDE.md` and `.ai-knowledge/project-specs/*.md`; read those before non-trivial changes.

## Skills (repo-local)

Skills live in **`.agents/skills/`** — each is a directory with a `SKILL.md`. Two exist:

- `vue-admin-env-setup/` — bootstrap/repair the local dev environment (MySQL, migrations, seeders, esbuild on Windows). Self-check: `node .agents/skills/vue-admin-env-setup/scripts/check-env.mjs`.
- `execute-plan/` — milestone-driven dev for the `plan/` commercial-upgrade docs, enforcing a `code → self-check → verify` loop per milestone.

Load the matching skill before doing env setup or `plan/` work; do not improvise those flows.

## Architecture

Two-package monorepo, **not** a workspace — each has its own `package.json` and `node_modules`.

- Root (`/`) — Vue 3 + Vite 6 frontend + shared dev tooling (eslint, prettier, vitest, playwright).
- `server/` — Express + Sequelize + Umzug backend (TypeScript). Own deps, own `tsconfig.json` (module `nodenext`, **`strict: false`** unlike frontend `strict: true`).
- Install both: `npm run install:all` (= `npm install && cd server && npm install`).
- Path aliases (root `tsconfig.json` + `vitest.config.ts`): `@/*` → `src/*`, `@shared/*` → `server/shared/*`.
- **Shared types**: Zod schemas in `server/shared/schemas/` are the single source of truth; the frontend infers types from them. Do not duplicate business types in `src/types/`.

## Commands — scope gotchas (read before running)

Tooling scope is uneven across packages; these are the easy mistakes:

| Command | Covers | Notes |
|---|---|---|
| `npm run lint` | **frontend only** | `eslint.config.mjs` ignores `server/**`. There is **no** server lint script. |
| `npm run format` | **frontend only** | Prettier targets `src/**`. Format backend separately: `npx prettier --write "server/**/*.ts"`. |
| `npm run typecheck` | **frontend only** | `vue-tsc`. Backend typecheck: `npm --prefix server run typecheck` (`tsc --noEmit`). |
| `npm test` | **frontend + backend** | Root `vitest.config.ts` includes both `src/__tests__` and `server/__tests__`. `--coverage --silent` by default. |
| `npm run test:fast` | both, no coverage | Quick iteration. |
| `npm --prefix server run test` | backend only | Uses `server/vitest.config.ts` (`environment: node`). |

Ignore the stray `run_typecheck.js`/`run_typecheck.bat` and `full_test_out.txt`/`typecheck_errors.txt` at root — they are Windows scratch helpers/artifacts. Use `npm run typecheck`.

## Verification order (enforced)

For any code change, run in order; each must pass before the next (mirrors CI and the `execute-plan` skill):

```powershell
npm run format        # 1. Prettier (src/ only)
npm run typecheck     # 2. vue-tsc (frontend)
npm run lint          # 3. ESLint --fix (frontend)
npm run test          # 4. Vitest (frontend + backend)
```

If you touched `server/`, add backend-specific steps (root `format`/`lint` skip it):

```powershell
npm --prefix server run typecheck
npm --prefix server run test
npx prettier --write "server/**/*.ts"
```

If you added a DB migration, verify it applied:

```powershell
npm run migrate:status   # executed count must be > 0 and include the new file
```

## Dev server & database

- `npm run dev` runs the **backend** (`cd server && tsx app.ts`); the Express server embeds Vite HMR middleware, so one process serves frontend + API. HTTPS self-signed at **`https://localhost:5173`**. Stop: `npm run stop` (kills port 5173).
- `npm run build` = frontend Vite build only. Full prod start: `npm run start` (builds backend with `tsc`, serves `dist/app.js`).
- Backend env is **`server/.env`** (not root). Required: `DB_*`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `SERVER_PORT`. Template: `.env.example` / `server/.env.example`.
- Migrations (Umzug), always run from root: `npm run migrate` (= `npm --prefix server run migrate`, i.e. `tsx scripts/migrate.ts`). Subcommands: `up`, `down`, `seed`, `reset` (⚠️ destructive), `status`.
- Migration files in `server/migrations/`, named `YYYYMMDD_NNNNNN_description.ts`. Use `query`/`addColumn`/`addIndex`, never `sync`.
- Bootstrap chain (`server/bootstrap.ts`): `ensureDatabaseExists()` (uses SQL `query`, **not** `execute`) → `sequelize.authenticate()` → `migrator.up()` → seed only if users table empty → listen.
- Defaults: admin `admin` / `123456`. API prefix `/api/v1`. Health `GET /health`. Swagger at `/api/docs`.

## Conventions that differ from defaults

- **Prettier**: no semicolons, single quotes, `trailingComma: all`, **`printWidth: 160`** (very wide), 2 spaces, `endOfLine: lf`. Keep lines long rather than wrapping early.
- **Encoding**: all source files UTF-8 **without BOM**. Chinese UI text/comments are common — verify no mojibake after edits.
- **TS strictness**: frontend `strict: true` + `noUnusedLocals/Parameters` (prefix unused with `_`); backend is `strict: false`. Avoid `any` (warns) unless in test files where it's allowed.
- Components: `<script setup lang="ts">`; Pinia **setup-store** style; Pinia instance in `src/stores/pinia.ts` (avoids circular deps). API modules: one file per business domain, object literal, returns `ApiResponse<T>`.
- **i18n gotcha**: sidebar menu labels are translated via a `path → sidebar.*` key mapping. **When you add a backend menu (especially multi-segment paths like `/online-users`), you must add the `sidebar.*` key to both `src/i18n/zh-CN.json` and `src/i18n/en-US.json`**, otherwise English UI silently falls back to the Chinese DB name.
- Comments: do not add comments unless asked (per `AI_DEVELOPMENT_GUIDE.md` 14.3). Minimal changes; read before editing.

## CI & branches

- CI (`.github/workflows/ci.yml`) installs with `npm ci --ignore-scripts` everywhere. Jobs: lint → typecheck (frontend **and** server) → audit (`--audit-level=high`) → test → build → lighthouse → e2e (needs a MySQL 8.0 service) → deploy-staging (on `dev`/`develop` push).
- E2E: `npm run test:e2e` (Playwright, config `e2e/playwright.config.ts`). Requires the dev server up on `https://localhost:5173` with a reachable MySQL.
- Branches: PRs target **`dev`** (dev base); `main` is frozen/prod. Use `feat/*`, `fix/*`, `refactor/*`.
- Conventional Commits enforced by commitlint (`commit-msg` hook). `pre-commit` runs `lint-staged` (eslint+prettier on `src/**` only).
- Coverage thresholds enforced in `vitest.config.ts`: statements/lines **70%**, branches/functions **60%** (the 65/55 in `CONTRIBUTING.md` is stale; the config is the source of truth).

## Windows / esbuild gotchas

- `tsx`/`esbuild` may throw `The service was stopped` — the esbuild binary is missing or version-mismatched. Fix by installing the matching `@esbuild/win32-x64` and copying the binary into `tsx`'s esbuild dir; or reinstall with `npm install --ignore-scripts` then copy the binary. **Do not** "fix" this by switching dev to `tsc` — `tsx` is required for HMR.
- `npm install` may fail on esbuild postinstall; use `npm install --ignore-scripts` and reinstall any still-missing package (e.g. `dotenv`) individually.
- PowerShell does **not** support `&&` — chain with `;` or `if ($?) { ... }`. Prefer `npm --prefix server run ...` over `cd server`.

## Reference docs

- `AI_DEVELOPMENT_GUIDE.md` — full architecture, conventions, key-file index (the authoritative spec).
- `.ai-knowledge/project-specs/*.md` — Chinese specs (code/API/DB/component/dir-structure/security/local-env).
- `CONTRIBUTING.md` — setup, branch strategy, commit types (coverage numbers are stale).
- `README.md` — setup quickstart (very large).
- `plan/` — commercial-upgrade milestone docs (`00`→`09`); use the `execute-plan` skill to work through them.
- `.agents/skills/` — the repo-local skills (see top of this file).
