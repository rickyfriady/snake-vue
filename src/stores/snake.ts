import { useIntervalFn } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  createInitialState,
  defaultSnakeConfig,
  isOppositeDirection,
  stepSnake,
  type Direction,
  type SnakeState,
} from '../game/snake-engine'

const keyDirectionMap: Record<string, Direction> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
}

const boardConfig = defaultSnakeConfig
const cellSize = 20

export const useSnakeStore = defineStore('snake', () => {
  const state = ref<SnakeState>(createInitialState(boardConfig))
  const pendingDirection = ref<Direction | null>(null)
  const tickMs = ref(140)

  const score = computed(() => state.value.score)
  const status = computed(() => state.value.status)
  const cols = boardConfig.cols
  const rows = boardConfig.rows
  const boardWidth = cols * cellSize
  const boardHeight = rows * cellSize

  const { pause, resume } = useIntervalFn(
    () => {
      if (state.value.status !== 'running') {
        return
      }

      state.value = stepSnake(state.value, boardConfig, pendingDirection.value)
      pendingDirection.value = null

      if (state.value.status === 'game_over') {
        pause()
      }
    },
    tickMs,
    { immediate: false },
  )

  const startGame = () => {
    if (state.value.status === 'idle' || state.value.status === 'paused') {
      state.value.status = 'running'
      resume()
    }
  }

  const pauseGame = () => {
    if (state.value.status === 'running') {
      state.value.status = 'paused'
      pause()
    }
  }

  const togglePause = () => {
    if (state.value.status === 'running') {
      pauseGame()
      return
    }

    if (state.value.status === 'paused') {
      startGame()
    }
  }

  const restartGame = () => {
    state.value = createInitialState(boardConfig)
    state.value.status = 'running'
    pendingDirection.value = null
    resume()
  }

  const setDirection = (nextDirection: Direction) => {
    const currentDirection = pendingDirection.value ?? state.value.direction

    if (currentDirection === nextDirection) {
      return
    }

    if (isOppositeDirection(currentDirection, nextDirection)) {
      return
    }

    pendingDirection.value = nextDirection

    if (state.value.status === 'idle') {
      startGame()
    }
  }

  const handleKeydown = (event: KeyboardEvent) => {
    const direction = keyDirectionMap[event.key.toLowerCase()]

    if (!direction) {
      return
    }

    event.preventDefault()
    setDirection(direction)
  }

  return {
    state,
    score,
    status,
    cols,
    rows,
    cellSize,
    boardWidth,
    boardHeight,
    startGame,
    pauseGame,
    togglePause,
    restartGame,
    setDirection,
    handleKeydown,
  }
})
