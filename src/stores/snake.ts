import { useIntervalFn, useStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createDailySeed } from '../game/daily-seed'
import {
  createInitialState,
  createSeededRandomizer,
  defaultSnakeConfig,
  isOppositeDirection,
  stepSnake,
  type Direction,
  type Randomizer,
  type SnakeState,
} from '../game/snake-engine'
import type { GameMode, PlayerProfile, RunResult } from '../types/game-session'

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
const tickMs = 140
const profileStorageKey = 'snake.player-profile.v1'
const historyLimit = 10
const dailySeedTimezone = 'UTC'

const defaultProfile: PlayerProfile = {
  name: 'Player',
  bestScore: 0,
  history: [],
}

const getSecureRandomUint32 = (): number => {
  if (globalThis.crypto !== undefined && typeof globalThis.crypto.getRandomValues === 'function') {
    const buffer = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buffer)
    return buffer[0] ?? 0
  }

  const seed = Date.now()
  return (seed ^ (seed >>> 9) ^ (seed << 13)) >>> 0
}

export const useSnakeStore = defineStore('snake', () => {
  const mode = ref<GameMode>('solo')
  const randomizer = ref<Randomizer>(createSeededRandomizer(Date.now() >>> 0))
  const activeSeed = ref<number>(0)
  const state = ref<SnakeState>(createInitialState(boardConfig, randomizer.value))
  const pendingDirection = ref<Direction | null>(null)
  const runStartedAtMs = ref<number | null>(null)
  const profile = useStorage<PlayerProfile>(profileStorageKey, defaultProfile, localStorage, {
    mergeDefaults: true,
  })

  const score = computed(() => state.value.score)
  const status = computed(() => state.value.status)
  const bestScore = computed(() => profile.value.bestScore)
  const playerName = computed(() => profile.value.name)
  const runHistory = computed(() => profile.value.history)
  const dailySeed = computed(() => (mode.value === 'daily' ? activeSeed.value : 0))
  const cols = boardConfig.cols
  const rows = boardConfig.rows
  const boardWidth = cols * cellSize
  const boardHeight = rows * cellSize

  const createRunId = (): string => `${Date.now()}-${getSecureRandomUint32()}`

  const configureRandomizer = (nextMode: GameMode) => {
    if (nextMode === 'daily') {
      activeSeed.value = createDailySeed(new Date(), dailySeedTimezone)
      randomizer.value = createSeededRandomizer(activeSeed.value)
      return
    }

    const baseSeed = (Date.now() ^ getSecureRandomUint32()) >>> 0
    activeSeed.value = baseSeed
    randomizer.value = createSeededRandomizer(baseSeed)
  }

  const createStateForMode = (nextMode: GameMode, nextStatus: SnakeState['status']) => {
    configureRandomizer(nextMode)
    state.value = createInitialState(boardConfig, randomizer.value)
    state.value.status = nextStatus
    pendingDirection.value = null
  }

  const appendRunResult = (result: RunResult) => {
    const nextHistory = [result, ...profile.value.history].slice(0, historyLimit)
    profile.value = {
      ...profile.value,
      bestScore: Math.max(profile.value.bestScore, result.score),
      history: nextHistory,
    }
  }

  const finalizeRun = () => {
    const startedAt = runStartedAtMs.value

    if (startedAt === null) {
      return
    }

    runStartedAtMs.value = null

    const result: RunResult = {
      id: createRunId(),
      mode: mode.value,
      score: state.value.score,
      maxLength: state.value.snake.length,
      durationMs: Math.max(Date.now() - startedAt, 0),
      endedAt: new Date().toISOString(),
    }

    appendRunResult(result)
  }

  const markRunStart = () => {
    if (runStartedAtMs.value === null) {
      runStartedAtMs.value = Date.now()
    }
  }

  const { pause, resume } = useIntervalFn(
    () => {
      if (state.value.status !== 'running') {
        return
      }

      const nextState = stepSnake(
        state.value,
        boardConfig,
        pendingDirection.value,
        randomizer.value,
      )
      state.value = nextState
      pendingDirection.value = null

      if (state.value.status === 'game_over') {
        finalizeRun()
        pause()
      }
    },
    tickMs,
    { immediate: false },
  )

  const startGame = () => {
    if (mode.value === 'multiplayer') {
      return
    }

    if (state.value.status === 'idle' || state.value.status === 'paused') {
      markRunStart()
      state.value.status = 'running'
      resume()
    }
  }

  const pauseGame = () => {
    if (mode.value === 'multiplayer') {
      return
    }

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
    if (mode.value === 'multiplayer') {
      return
    }

    createStateForMode(mode.value, 'running')
    runStartedAtMs.value = Date.now()
    resume()
  }

  const resetToIdle = () => {
    runStartedAtMs.value = null
    pause()
    createStateForMode(mode.value, 'idle')
  }

  const setMode = (nextMode: GameMode) => {
    if (mode.value === nextMode) {
      return
    }

    mode.value = nextMode
    resetToIdle()
  }

  const setPlayerName = (nextName: string) => {
    const normalizedName = nextName.trim().slice(0, 24)

    if (normalizedName.length === 0 || normalizedName === profile.value.name) {
      return
    }

    profile.value = {
      ...profile.value,
      name: normalizedName,
    }
  }

  const setDirection = (nextDirection: Direction) => {
    if (mode.value === 'multiplayer') {
      return
    }

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

  const applyExternalState = (nextState: SnakeState) => {
    if (mode.value !== 'multiplayer') {
      return
    }

    pause()
    pendingDirection.value = null
    state.value = nextState
  }

  configureRandomizer(mode.value)
  state.value = createInitialState(boardConfig, randomizer.value)

  return {
    state,
    mode,
    dailySeed,
    playerName,
    bestScore,
    runHistory,
    score,
    status,
    cols,
    rows,
    cellSize,
    boardWidth,
    boardHeight,
    setMode,
    setPlayerName,
    applyExternalState,
    startGame,
    pauseGame,
    togglePause,
    restartGame,
    resetToIdle,
    setDirection,
    handleKeydown,
  }
})
