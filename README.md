# Snake Vue

Classic Snake game built with Vue 3 (`<script setup lang="ts">`), Pinia, VueUse, and Tailwind CSS v4.

## Scope

- Classic Snake loop only: movement, growth, food, score, game-over, restart.
- Canvas renderer with minimal UI.
- Deterministic game engine in pure TypeScript for testability.

## Run

```bash
bun install
bun dev
```

Open `http://localhost:5173/`.

## Scripts

```bash
bun run lint
bun run test
bun run typecheck
bun run build
```

## Project Structure

- `src/game/snake-engine.ts`: pure game rules and state transitions.
- `src/stores/snake.ts`: Pinia state + timer loop + input handling.
- `src/App.vue`: canvas rendering and controls.
- `src/game/snake-engine.test.ts`: core engine unit tests.

## Controls

- Keyboard: arrow keys or `W/A/S/D`
- Pause/Resume: `Space`
- Restart: `R` or Restart button
- Mobile: on-screen direction buttons are shown on small screens

## Manual Verification Checklist

- Start game and confirm snake moves one cell per tick.
- Confirm arrow/WASD controls update direction and cannot reverse instantly.
- Eat food and confirm snake grows and score increases.
- Hit wall and confirm game-over state.
- Confirm pause/resume works with button and `Space`.
- Confirm restart resets snake, score, and starts a new run.
