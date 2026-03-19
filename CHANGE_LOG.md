# Change Log

## 2026-03-19

### Added

- Daily challenge mode with deterministic date-based seed.
- Player profile persistence (name, best score, recent run history).
- Leaderboard API client in frontend (`src/services/snake-api.ts`).
- Bun backend server (`server/index.ts`) with:
  - `GET /api/health`
  - `GET /api/leaderboard`
  - `POST /api/leaderboard/submit`
  - `WS /ws` room-based multiplayer protocol
- Multiplayer Pinia store (`src/stores/snake-multiplayer.ts`) and in-page lobby UI.
- Backend protocol tests in `server/index.test.ts`.
- Bun runtime types via `@types/bun`.
- New npm script: `server:dev`.

### Updated

- `src/stores/snake.ts`:
  - Added mode switching (`solo`, `daily`, `multiplayer`).
  - Added secure seeded randomizer setup per mode.
  - Added run finalization and persistence updates.
  - Added multiplayer-safe behavior to pause/start/restart/direction handlers.
- `src/pages/SnakePage.vue`:
  - Added mode selector, player profile input, and stats panels.
  - Added leaderboard panel and submission refresh behavior.
  - Added multiplayer room controls (create/join/ready/restart/leave).
  - Updated keyboard behavior to handle multiplayer actions.
- `src/game/snake-engine.ts`:
  - Added `createSeededRandomizer`.
- `src/game/snake-engine.test.ts`:
  - Added deterministic randomizer and daily seed tests.
- `vite.config.ts`:
  - Added dev proxy routes for `/api` and `/ws` to backend.
- `tsconfig.node.json`:
  - Added Bun types and server include coverage.

## v0.1.0 (2026-03-19)

- First tagged release candidate for Snake Vue.
- Includes classic Snake gameplay, strict lint/type/test/build gates, CI workflow, route-based pages, and release automation.
- Added `.github/workflows/release.yml` for tag-driven GitHub Releases with build artifact upload and generated release notes.

## 2026-03-18

### Added

- Classic Snake game implementation with canvas rendering.
- Deterministic game engine in `src/game/snake-engine.ts`.
- Pinia game store with tick loop, pause/resume, and restart in `src/stores/snake.ts`.
- Keyboard controls (Arrow + WASD) and mobile on-screen direction controls.
- Unit tests for movement, collisions, growth, and food placement in `src/game/snake-engine.test.ts`.

### Updated

- Moved app to route-based navigation:
  - `/` home page (`src/pages/HomePage.vue`),
  - `/snake` game page (`src/pages/SnakePage.vue`),
  - router setup in `src/router/index.ts`.
- Converted `src/App.vue` to router shell with `<RouterView />`.
- Improved production canvas rendering:
    - HiDPI scaling for sharper board rendering.
    - Responsive canvas sizing for mobile layouts.
    - Explicit initial draw on mount so first frame is visible before interaction.
- Wired Pinia into app bootstrap in `src/main.ts`.
- Switched styles to minimal Tailwind v4 setup in `src/style.css`.
- Updated `vite.config.ts` to include `@tailwindcss/vite`.
- Updated `tsconfig.app.json` and added `src/vite-env.d.ts` for Vue typing.
- Extended README with scope, structure, controls, and manual verification checklist.

### Tooling

- Added dependencies: `pinia`, `@vueuse/core`, `tailwindcss`, `@tailwindcss/vite`.
- Added dependency: `vue-router` for route-based navigation.
- Added dev tooling: Biome, ESLint, Husky, Danger.
- Added config files: `biome.json`, `eslint.config.mjs`, `dangerfile.ts`.
- Added scripts for lint, test, typecheck, danger, and prepare in `package.json`.
- Added release scripts:
  - `release:check` (full quality gate),
  - `release:tag` (annotated git tag helper).
- Added `scripts/release-tag.sh` for guarded release tagging.
- Added Husky pre-commit hook to run lint and tests.
- Tightened Biome policy with stricter rule groups (`complexity`, `performance`, `security`, `suspicious`, `style`) and explicit formatting line width.
- Tightened TypeScript policy in app/node configs with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, and related strict checks.
- Strengthened `dangerfile.ts` gates for:
    - source changes without tests,
    - source/config changes without docs/changelog updates,
    - missing lockfile updates on dependency changes,
    - accidental `console.*` and `debugger` in production source.
- Added SonarQube-style lint rules via `eslint-plugin-sonarjs`.
- Enforced stricter ESLint safety rules to avoid:
  - `console` usage in app code (except `warn` and `error`),
  - explicit `any`,
  - explicit `unknown`.
- Aligned `eslint.config.mjs` with added ESLint plugins in `package.json`:
  - `@vitest/eslint-plugin` for test files,
  - `eslint-plugin-import-x` import ordering/duplicate protection,
  - `eslint-plugin-security-node` recommended security rules.
- Added and wired additional ESLint plugins:
  - `eslint-plugin-unicorn`,
  - `eslint-plugin-promise`,
  - `eslint-plugin-regexp`,
  - `eslint-plugin-vuejs-accessibility`.
- Tuned code/config to satisfy new lint rules (regex non-capturing groups, import order, global object access style, and loop style).
- Resolved strict TypeScript lib-check issue by adding `@types/web-bluetooth` and registering `web-bluetooth` in app compiler `types`.
- Adjusted `tsconfig.app.json` `skipLibCheck` to `true` to handle upstream `vue-router` type incompatibility while preserving strict checks for application code.
- Added CI workflow in `.github/workflows/ci.yml` to run lint, typecheck, test, and build on push/PR.
