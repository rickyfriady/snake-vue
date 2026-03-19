# Snake Vue

Classic Snake game built with Vue 3 (`<script setup lang="ts">`), Pinia, VueUse, Tailwind CSS v4, and a Bun WebSocket/API backend for multiplayer + leaderboard.

## Scope

- Classic Snake loop: movement, growth, food, score, game-over, restart.
- Modes: `solo`, `daily challenge` (deterministic seed), `multiplayer`.
- Persistence: player profile, best score, and recent run history.
- Backend: leaderboard submission/fetch and realtime room-based multiplayer over WebSocket.
- Deterministic game engine in pure TypeScript for testability.

## Run

```bash
bun install
bun run server:dev
bun run dev:full
bun dev
```

Open `http://localhost:5173/` and navigate to `/snake`.

Routes:

- `/`: Home page
- `/snake`: Snake game

## Scripts

```bash
bun run lint
bun run test
bun run typecheck
bun run build
bun run server:dev
bun run dev:full
bun run release:check
```

## CI

GitHub Actions workflow is available at `.github/workflows/ci.yml` and runs:

- lint
- typecheck
- test
- build

## Release Automation

Tag pushes matching `v*` trigger `.github/workflows/release.yml` which:

- runs `release:check` quality gates,
- builds and archives `dist/`,
- publishes a GitHub Release with generated notes and attached artifact.

To create an annotated release tag from `package.json` version:

```bash
bun run release:tag
```

Or pass a custom version:

```bash
bun run release:tag -- 1.0.0
```

## Project Structure

- `src/game/snake-engine.ts`: pure game rules and state transitions.
- `src/game/daily-seed.ts`: deterministic daily seed generator.
- `src/stores/snake.ts`: Pinia state + timer loop + mode/profile/history.
- `src/stores/snake-multiplayer.ts`: WebSocket room lifecycle and realtime sync.
- `src/services/snake-api.ts`: leaderboard API client.
- `src/App.vue`: router shell (`<RouterView />`).
- `src/router/index.ts`: route definitions.
- `src/pages/HomePage.vue`: home route page.
- `src/pages/SnakePage.vue`: game route page.
- `src/types/snake-network.ts`: shared leaderboard/multiplayer payload contracts.
- `server/index.ts`: Bun API + WebSocket server entrypoint.
- `server/index.test.ts`: backend protocol/validation tests.
- `src/game/snake-engine.test.ts`: engine + daily seed unit tests.

## Controls

- Keyboard: arrow keys or `W/A/S/D`
- Solo/Daily pause/resume: `Space`
- Solo/Daily restart: `R` or Restart button
- Multiplayer: `Space` toggles ready, `R` restarts finished match
- Mobile: on-screen direction buttons are shown on small screens

## Manual Verification Checklist

- Start game and confirm snake moves one cell per tick.
- Confirm arrow/WASD controls update direction and cannot reverse instantly.
- Eat food and confirm snake grows and score increases.
- Hit wall and confirm game-over state.
- Confirm pause/resume works with button and `Space`.
- Confirm restart resets snake, score, and starts a new run.
- Switch to Daily mode and verify seed is shown and stable for the same day.
- Finish runs and verify recent history + best score persist after refresh.
- Verify leaderboard refresh and score submission work when backend is running.
- Multiplayer manual flow:
    - Create room in browser A, join room in browser B.
    - Toggle ready on both clients and verify synchronized match start.
    - Verify both clients receive state updates and scores.
    - Verify leave/rejoin/restart flow on finished match.
