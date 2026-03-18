# Change Log

## 2026-03-18

### Added

- Classic Snake game implementation with canvas rendering.
- Deterministic game engine in `src/game/snake-engine.ts`.
- Pinia game store with tick loop, pause/resume, and restart in `src/stores/snake.ts`.
- Keyboard controls (Arrow + WASD) and mobile on-screen direction controls.
- Unit tests for movement, collisions, growth, and food placement in `src/game/snake-engine.test.ts`.

### Updated

- Replaced starter page with Snake game UI in `src/App.vue`.
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
- Added dev tooling: Biome, ESLint, Husky, Danger.
- Added config files: `biome.json`, `eslint.config.mjs`, `dangerfile.ts`.
- Added scripts for lint, test, typecheck, danger, and prepare in `package.json`.
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
