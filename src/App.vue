<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { SnakeState } from './game/snake-engine'
import { useSnakeStore } from './stores/snake'

const store = useSnakeStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const statusLabel = computed(() => {
  if (store.status === 'idle') {
    return 'Ready'
  }

  if (store.status === 'running') {
    return 'Running'
  }

  if (store.status === 'paused') {
    return 'Paused'
  }

  return 'Game Over'
})

const pauseLabel = computed(() =>
  store.status === 'paused' ? 'Resume' : 'Pause',
)

const canPause = computed(
  () => store.status === 'running' || store.status === 'paused',
)

const drawGrid = (context: CanvasRenderingContext2D) => {
  context.strokeStyle = '#1f2937'
  context.lineWidth = 1

  for (let x = 0; x <= store.cols; x += 1) {
    context.beginPath()
    context.moveTo(x * store.cellSize + 0.5, 0)
    context.lineTo(x * store.cellSize + 0.5, store.boardHeight)
    context.stroke()
  }

  for (let y = 0; y <= store.rows; y += 1) {
    context.beginPath()
    context.moveTo(0, y * store.cellSize + 0.5)
    context.lineTo(store.boardWidth, y * store.cellSize + 0.5)
    context.stroke()
  }
}

const drawSnake = (context: CanvasRenderingContext2D, state: SnakeState) => {
  for (const [index, segment] of state.snake.entries()) {
    context.fillStyle = index === 0 ? '#22c55e' : '#16a34a'
    context.fillRect(
      segment.x * store.cellSize + 1,
      segment.y * store.cellSize + 1,
      store.cellSize - 2,
      store.cellSize - 2,
    )
  }
}

const drawFood = (context: CanvasRenderingContext2D, state: SnakeState) => {
  context.fillStyle = '#ef4444'
  context.fillRect(
    state.food.x * store.cellSize + 2,
    state.food.y * store.cellSize + 2,
    store.cellSize - 4,
    store.cellSize - 4,
  )
}

const drawBoard = (state: SnakeState) => {
  const canvas = canvasRef.value

  if (!canvas) {
    return
  }

  const context = canvas.getContext('2d')

  if (!context) {
    return
  }

  const pixelRatio = globalThis.devicePixelRatio || 1
  const targetWidth = Math.floor(store.boardWidth * pixelRatio)
  const targetHeight = Math.floor(store.boardHeight * pixelRatio)

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth
    canvas.height = targetHeight
  }

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.fillStyle = '#020617'
  context.fillRect(0, 0, store.boardWidth, store.boardHeight)
  drawGrid(context)
  drawSnake(context, state)
  drawFood(context, state)
}

watch(
  () => store.state,
  (state) => {
    drawBoard(state)
  },
  { deep: true, immediate: true },
)

const onKeydown = (event: KeyboardEvent) => {
  if (event.code === 'Space') {
    event.preventDefault()
    store.togglePause()
    return
  }

  if (event.key.toLowerCase() === 'r') {
    event.preventDefault()
    store.restartGame()
    return
  }

  store.handleKeydown(event)
}

onMounted(() => {
  globalThis.addEventListener('keydown', onKeydown, { passive: false })
  drawBoard(store.state)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <main
    class="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center gap-4 px-4 py-6"
  >
    <header
      class="flex w-full items-center justify-between rounded border border-slate-300 bg-white px-3 py-2"
    >
      <h1 class="text-lg font-semibold text-slate-900">Snake</h1>
      <div class="text-sm text-slate-700">
        Score: <span class="font-semibold text-slate-900">{{ store.score }}</span>
      </div>
      <div class="text-sm font-medium text-slate-700">{{ statusLabel }}</div>
    </header>

    <canvas
      ref="canvasRef"
      class="aspect-square h-auto w-full max-w-[400px] rounded border border-slate-300 bg-slate-950 [image-rendering:pixelated]"
    />

    <div class="flex w-full justify-center gap-2">
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        @click="store.startGame"
      >
        Start
      </button>
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        :disabled="!canPause"
        @click="store.togglePause"
      >
        {{ pauseLabel }}
      </button>
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="store.restartGame"
      >
        Restart
      </button>
    </div>

    <div class="grid w-full max-w-[220px] grid-cols-3 gap-2 sm:hidden">
      <div />
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="store.setDirection('up')"
      >
        ↑
      </button>
      <div />
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="store.setDirection('left')"
      >
        ←
      </button>
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="store.setDirection('down')"
      >
        ↓
      </button>
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="store.setDirection('right')"
      >
        →
      </button>
    </div>

    <p class="text-center text-sm text-slate-600">
      Controls: Arrow keys / WASD, <kbd>Space</kbd> pause, <kbd>R</kbd> restart.
    </p>
  </main>
</template>
