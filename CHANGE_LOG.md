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
