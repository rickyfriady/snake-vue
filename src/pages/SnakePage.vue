<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'

import type { Direction, SnakeState } from '../game/snake-engine'
import {
  fetchBackendHealth,
  fetchLeaderboard,
  submitLeaderboardEntry,
} from '../services/snake-api'
import { useSnakeStore } from '../stores/snake'
import { useSnakeMultiplayerStore } from '../stores/snake-multiplayer'
import type { GameMode, RunResult } from '../types/game-session'
import type { LeaderboardEntry } from '../types/snake-network'

const store = useSnakeStore()
const multiplayerStore = useSnakeMultiplayerStore()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const playerNameDraft = ref(store.playerName)
const multiplayerRoomCodeDraft = ref('')
const leaderboardScope = ref<'daily' | 'all_time'>('daily')
const leaderboardEntries = ref<LeaderboardEntry[]>([])
const leaderboardLoading = ref(false)
const leaderboardError = ref('')
const leaderboardSubmitError = ref('')
const multiplayerActionPending = ref(false)
const submittedRunIds = new Set<string>()
const multiplayerBackendStatus = ref<'checking' | 'online' | 'offline'>('checking')
const multiplayerBackendMessage = ref('Checking multiplayer backend...')
const multiplayerOfflineErrorMessage = 'Multiplayer backend is offline.'
const multiplayerSocketErrorMessage = 'Unable to connect multiplayer socket.'

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

const modeOptions: { label: string; value: GameMode }[] = [
  { label: 'Solo', value: 'solo' },
  { label: 'Daily', value: 'daily' },
  { label: 'Multiplayer', value: 'multiplayer' },
]

const isMultiplayerMode = computed(() => store.mode === 'multiplayer')
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
  () => !isMultiplayerMode.value && (store.status === 'running' || store.status === 'paused'),
)
const isMultiplayerBackendOnline = computed(
  () => multiplayerBackendStatus.value === 'online',
)
const multiplayerControlsDisabled = computed(
  () => multiplayerActionPending.value || !isMultiplayerBackendOnline.value,
)

const roomPhaseLabel = computed(() => {
  if (!multiplayerStore.room) {
    return 'No Room'
  }

  if (multiplayerStore.room.phase === 'waiting') {
    return 'Waiting'
  }

  if (multiplayerStore.room.phase === 'running') {
    return 'Running'
  }

  return 'Finished'
})

const formatDuration = (durationMs: number): string => {
  const totalSeconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const formatEndedAt = (timestamp: string): string => {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

const formatMode = (mode: RunResult['mode']): string => {
  if (mode === 'daily') {
    return 'Daily'
  }

  if (mode === 'multiplayer') {
    return 'Multiplayer'
  }

  return 'Solo'
}

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

const applyPlayerName = () => {
  store.setPlayerName(playerNameDraft.value)
  playerNameDraft.value = store.playerName
}

const markBackendOffline = (message: string) => {
  multiplayerBackendStatus.value = 'offline'
  multiplayerBackendMessage.value = message
}

const markBackendOnline = () => {
  multiplayerBackendStatus.value = 'online'
  multiplayerBackendMessage.value = 'Backend online.'
}

const checkMultiplayerBackend = async (): Promise<boolean> => {
  multiplayerBackendStatus.value = 'checking'
  multiplayerBackendMessage.value = 'Checking multiplayer backend...'

  try {
    const response = await fetchBackendHealth()

    if (response.status !== 'ok') {
      markBackendOffline('Backend returned unhealthy status.')
      return false
    }

    markBackendOnline()
    return true
  } catch {
    markBackendOffline('Backend offline. Start `bun run server:dev`.')
    return false
  }
}

const ensureMultiplayerConnection = async (): Promise<boolean> => {
  if (!isMultiplayerMode.value) {
    return false
  }

  if (!isMultiplayerBackendOnline.value) {
    const isOnline = await checkMultiplayerBackend()

    if (!isOnline) {
      return false
    }
  }

  if (multiplayerStore.connectionStatus === 'connected') {
    return true
  }

  try {
    await multiplayerStore.connect()
    return true
  } catch {
    markBackendOffline('Unable to open multiplayer socket.')
    leaderboardError.value = multiplayerSocketErrorMessage
    return false
  }
}

const initializeMultiplayerMode = async () => {
  const connected = await ensureMultiplayerConnection()

  if (!connected || store.mode !== 'multiplayer') {
    return
  }

  leaderboardError.value = ''
}

const retryMultiplayerBackend = async () => {
  multiplayerActionPending.value = true

  try {
    const connected = await ensureMultiplayerConnection()

    if (connected) {
      leaderboardError.value = ''
    }
  } finally {
    multiplayerActionPending.value = false
  }
}

const sendDirection = (direction: Direction) => {
  if (isMultiplayerMode.value) {
    if (
      !isMultiplayerBackendOnline.value ||
      multiplayerStore.connectionStatus !== 'connected'
    ) {
      return
    }

    multiplayerStore.sendDirection(direction).catch(() => {
      markBackendOffline('Multiplayer socket lost. Retry backend connection.')
      leaderboardError.value = 'Unable to send multiplayer input.'
    })
    return
  }

  store.setDirection(direction)
}

const interactiveTargetSelector =
  'input, textarea, select, button, [contenteditable="true"], [role="textbox"]'

const shouldIgnoreGlobalShortcut = (event: KeyboardEvent): boolean => {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return true
  }

  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return false
  }

  return target.matches(interactiveTargetSelector) || target.closest(interactiveTargetSelector) !== null
}

const processDirectionHotkey = (event: KeyboardEvent): boolean => {
  const direction = keyDirectionMap[event.key.toLowerCase()]

  if (!direction) {
    return false
  }

  event.preventDefault()
  sendDirection(direction)
  return true
}

const onKeydown = (event: KeyboardEvent) => {
  if (shouldIgnoreGlobalShortcut(event)) {
    return
  }

  if (processDirectionHotkey(event)) {
    return
  }

  if (event.code === 'Space') {
    event.preventDefault()

    if (isMultiplayerMode.value) {
      if (!isMultiplayerBackendOnline.value) {
        leaderboardError.value = multiplayerOfflineErrorMessage
        return
      }

      multiplayerStore.setReady(!multiplayerStore.isReady).catch(() => {
        leaderboardError.value = 'Unable to update ready state.'
      })
      return
    }

    store.togglePause()
    return
  }

  if (event.key.toLowerCase() === 'r') {
    event.preventDefault()

    if (isMultiplayerMode.value) {
      if (!isMultiplayerBackendOnline.value) {
        leaderboardError.value = multiplayerOfflineErrorMessage
        return
      }

      multiplayerStore.restartRoom().catch(() => {
        leaderboardError.value = 'Unable to restart multiplayer room.'
      })
      return
    }

    store.restartGame()
  }
}

const refreshLeaderboard = async () => {
  leaderboardLoading.value = true

  try {
    const response = await fetchLeaderboard(leaderboardScope.value)
    leaderboardEntries.value = response.entries
    leaderboardError.value = ''
  } catch {
    leaderboardError.value = 'Leaderboard is unavailable. Start `bun run server:dev`.'
  } finally {
    leaderboardLoading.value = false
  }
}

const submitRunToLeaderboard = async (run: RunResult) => {
  if (run.mode !== 'solo' && run.mode !== 'daily') {
    return
  }

  try {
    const submitPayload = {
      playerName: store.playerName,
      mode: run.mode,
      score: run.score,
      durationMs: run.durationMs,
      maxLength: run.maxLength,
      endedAt: run.endedAt,
      ...(run.mode === 'daily' ? { dailySeed: store.dailySeed } : {}),
    }

    await submitLeaderboardEntry(submitPayload)

    leaderboardSubmitError.value = ''
    await refreshLeaderboard()
  } catch {
    leaderboardSubmitError.value = 'Unable to submit score to leaderboard.'
  }
}

const createMultiplayerRoom = async () => {
  multiplayerActionPending.value = true

  try {
    const connected = await ensureMultiplayerConnection()
    if (!connected) {
      leaderboardError.value = multiplayerOfflineErrorMessage
      return
    }

    await multiplayerStore.createRoom(store.playerName)
    leaderboardError.value = ''
  } catch {
    leaderboardError.value = 'Unable to create room. Start `bun run server:dev`.'
  } finally {
    multiplayerActionPending.value = false
  }
}

const joinMultiplayerRoom = async () => {
  const roomCode = multiplayerRoomCodeDraft.value.trim().toUpperCase()

  if (roomCode.length === 0) {
    leaderboardError.value = 'Room code is required.'
    return
  }

  multiplayerActionPending.value = true

  try {
    const connected = await ensureMultiplayerConnection()
    if (!connected) {
      leaderboardError.value = multiplayerOfflineErrorMessage
      return
    }

    await multiplayerStore.joinRoom(roomCode, store.playerName)
    leaderboardError.value = ''
  } catch {
    leaderboardError.value = 'Unable to join room.'
  } finally {
    multiplayerActionPending.value = false
  }
}

const toggleReady = async () => {
  multiplayerActionPending.value = true

  try {
    const connected = await ensureMultiplayerConnection()
    if (!connected) {
      leaderboardError.value = multiplayerOfflineErrorMessage
      return
    }

    await multiplayerStore.setReady(!multiplayerStore.isReady)
  } catch {
    leaderboardError.value = 'Unable to update ready state.'
  } finally {
    multiplayerActionPending.value = false
  }
}

const leaveMultiplayerRoom = async () => {
  multiplayerActionPending.value = true

  try {
    await multiplayerStore.leaveRoom()
  } catch {
    multiplayerStore.closeSocket()
  } finally {
    multiplayerActionPending.value = false
  }
}

watch(
  () => store.state,
  (state) => {
    drawBoard(state)
  },
  { deep: true, immediate: true },
)

watch(
  () => store.playerName,
  (nextPlayerName) => {
    if (playerNameDraft.value !== nextPlayerName) {
      playerNameDraft.value = nextPlayerName
    }
  },
)

watch(
  () => leaderboardScope.value,
  () => {
    refreshLeaderboard().catch(() => {
      leaderboardError.value = 'Unable to refresh leaderboard.'
    })
  },
  { immediate: true },
)

watch(
  () => store.runHistory[0],
  (run) => {
    if (!run || submittedRunIds.has(run.id)) {
      return
    }

    submittedRunIds.add(run.id)
    submitRunToLeaderboard(run).catch(() => {
      leaderboardSubmitError.value = 'Unable to submit score to leaderboard.'
    })
  },
)

watch(
  () => store.mode,
  (nextMode, previousMode) => {
    if (nextMode === 'multiplayer') {
      initializeMultiplayerMode().catch(() => {
        markBackendOffline('Unable to open multiplayer socket.')
        leaderboardError.value = multiplayerSocketErrorMessage
      })
      return
    }

    multiplayerBackendStatus.value = 'checking'
    multiplayerBackendMessage.value = 'Checking multiplayer backend...'

    if (previousMode === 'multiplayer') {
      multiplayerStore.leaveRoom().catch(() => {
        multiplayerStore.closeSocket()
      })
    }
  },
)

watch(
  () => multiplayerStore.roomCode,
  (nextRoomCode) => {
    if (nextRoomCode.length > 0) {
      multiplayerRoomCodeDraft.value = nextRoomCode
    }
  },
)

watch(
  () => multiplayerStore.errorMessage,
  (nextMessage) => {
    if (nextMessage.length > 0) {
      leaderboardError.value = nextMessage
    }
  },
)

watch(
  () => multiplayerStore.connectionStatus,
  (nextStatus) => {
    if (store.mode !== 'multiplayer') {
      return
    }

    if (nextStatus === 'disconnected' && isMultiplayerBackendOnline.value) {
      markBackendOffline('Multiplayer disconnected. Retry backend connection.')
    }
  },
)

onMounted(() => {
  globalThis.addEventListener('keydown', onKeydown, { passive: false })
  drawBoard(store.state)
})

onBeforeUnmount(() => {
  globalThis.removeEventListener('keydown', onKeydown)

  if (store.mode === 'multiplayer') {
    multiplayerStore.leaveRoom().catch(() => {
      multiplayerStore.closeSocket()
    })
  }
})
</script>

<template>
  <main
    class="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center gap-4 px-4 py-6"
  >
    <header class="flex w-full items-center justify-between">
      <RouterLink
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 no-underline"
        to="/"
      >
        Home
      </RouterLink>
    </header>

    <section class="w-full rounded border border-slate-300 bg-white px-3 py-3">
      <div class="flex items-center justify-between">
        <h1 class="text-lg font-semibold text-slate-900">Snake</h1>
        <div class="text-sm font-medium text-slate-700">{{ statusLabel }}</div>
      </div>
      <div class="mt-2 flex flex-wrap items-center gap-4 text-sm text-slate-700">
        <div>
          Score: <span class="font-semibold text-slate-900">{{ store.score }}</span>
        </div>
        <div>
          Best: <span class="font-semibold text-slate-900">{{ store.bestScore }}</span>
        </div>
        <div v-if="store.mode === 'daily'">
          Seed:
          <span class="font-semibold text-slate-900">{{ store.dailySeed }}</span>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          v-for="option in modeOptions"
          :key="option.value"
          class="rounded border px-3 py-1.5 text-sm font-medium"
          :class="
            store.mode === option.value
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-300 bg-white text-slate-900'
          "
          @click="store.setMode(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <div class="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
        <span>Player</span>
        <input
          v-model.trim="playerNameDraft"
          aria-label="Player name"
          class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          maxlength="24"
          type="text"
          @blur="applyPlayerName"
          @keydown.enter.prevent="applyPlayerName"
        >
      </div>
    </section>

    <section
      v-if="isMultiplayerMode"
      class="w-full rounded border border-slate-300 bg-white px-3 py-3"
    >
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Multiplayer</h2>
        <div class="flex items-center gap-2">
          <span
            class="text-xs font-medium"
            :class="isMultiplayerBackendOnline ? 'text-emerald-700' : 'text-red-600'"
          >
            {{ isMultiplayerBackendOnline ? 'Backend Online' : 'Backend Offline' }}
          </span>
          <span class="text-xs font-medium text-slate-700">{{ roomPhaseLabel }}</span>
        </div>
      </div>
      <p
        class="mt-1 text-xs"
        :class="isMultiplayerBackendOnline ? 'text-slate-600' : 'text-red-600'"
      >
        {{ multiplayerBackendMessage }}
      </p>
      <button
        v-if="!isMultiplayerBackendOnline"
        class="mt-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-900 disabled:opacity-50"
        :disabled="multiplayerActionPending"
        @click="retryMultiplayerBackend"
      >
        Retry Backend Connection
      </button>

      <div
        v-if="!multiplayerStore.hasRoom"
        class="mt-2 space-y-2"
      >
        <input
          v-model.trim="multiplayerRoomCodeDraft"
          aria-label="Multiplayer room code"
          class="w-full rounded border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
          :disabled="multiplayerControlsDisabled"
          placeholder="Room code"
          type="text"
        >
        <div class="flex gap-2">
          <button
            class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            :disabled="multiplayerControlsDisabled"
            @click="createMultiplayerRoom"
          >
            Create Room
          </button>
          <button
            class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            :disabled="multiplayerControlsDisabled"
            @click="joinMultiplayerRoom"
          >
            Join Room
          </button>
        </div>
      </div>

      <div
        v-else
        class="mt-2 space-y-2 text-sm text-slate-700"
      >
        <div>
          Room: <span class="font-semibold text-slate-900">{{ multiplayerStore.roomCode }}</span>
        </div>
        <ul class="space-y-1">
          <li
            v-for="player in multiplayerStore.room?.players"
            :key="player.playerId"
            class="flex items-center justify-between rounded border border-slate-200 px-2 py-1"
          >
            <span class="font-medium text-slate-900">{{ player.playerName }}</span>
            <span>{{ player.ready ? 'Ready' : 'Not Ready' }}</span>
            <span>Score {{ player.score }}</span>
            <span>{{ player.status }}</span>
          </li>
        </ul>
        <div class="flex flex-wrap gap-2">
          <button
            class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            :disabled="multiplayerControlsDisabled"
            @click="toggleReady"
          >
            {{ multiplayerStore.isReady ? 'Unready' : 'Ready' }}
          </button>
          <button
            class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            :disabled="
              multiplayerControlsDisabled || multiplayerStore.room?.phase !== 'finished'
            "
            @click="multiplayerStore.restartRoom"
          >
            Restart Match
          </button>
          <button
            class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            :disabled="multiplayerActionPending"
            @click="leaveMultiplayerRoom"
          >
            Leave Room
          </button>
        </div>
      </div>
    </section>

    <canvas
      ref="canvasRef"
      class="aspect-square h-auto w-full max-w-[400px] rounded border border-slate-300 bg-slate-950 [image-rendering:pixelated]"
    />

    <div class="flex w-full justify-center gap-2">
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        :disabled="isMultiplayerMode"
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
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
        :disabled="isMultiplayerMode"
        @click="store.restartGame"
      >
        Restart
      </button>
    </div>

    <section class="w-full rounded border border-slate-300 bg-white px-3 py-3">
      <h2 class="text-sm font-semibold text-slate-900">Recent Runs</h2>
      <p
        v-if="store.runHistory.length === 0"
        class="mt-2 text-sm text-slate-600"
      >
        No runs yet. Start and finish a game to record your stats.
      </p>
      <ul
        v-else
        class="mt-2 space-y-1 text-sm text-slate-700"
      >
        <li
          v-for="run in store.runHistory"
          :key="run.id"
          class="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5"
        >
          <span class="font-medium text-slate-900">{{ formatMode(run.mode) }}</span>
          <span>Score {{ run.score }}</span>
          <span>Len {{ run.maxLength }}</span>
          <span>{{ formatDuration(run.durationMs) }}</span>
          <span class="text-xs text-slate-500">{{ formatEndedAt(run.endedAt) }}</span>
        </li>
      </ul>
      <p
        v-if="leaderboardSubmitError.length > 0"
        class="mt-2 text-xs text-red-600"
      >
        {{ leaderboardSubmitError }}
      </p>
    </section>

    <section class="w-full rounded border border-slate-300 bg-white px-3 py-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-semibold text-slate-900">Leaderboard</h2>
        <div class="flex gap-1">
          <button
            class="rounded border px-2 py-1 text-xs font-medium"
            :class="
              leaderboardScope === 'daily'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-900'
            "
            @click="leaderboardScope = 'daily'"
          >
            Daily
          </button>
          <button
            class="rounded border px-2 py-1 text-xs font-medium"
            :class="
              leaderboardScope === 'all_time'
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-900'
            "
            @click="leaderboardScope = 'all_time'"
          >
            All Time
          </button>
        </div>
      </div>

      <p
        v-if="leaderboardLoading"
        class="mt-2 text-sm text-slate-600"
      >
        Loading leaderboard...
      </p>
      <p
        v-else-if="leaderboardError.length > 0"
        class="mt-2 text-sm text-red-600"
      >
        {{ leaderboardError }}
      </p>
      <p
        v-else-if="leaderboardEntries.length === 0"
        class="mt-2 text-sm text-slate-600"
      >
        No leaderboard entries yet.
      </p>
      <ol
        v-else
        class="mt-2 space-y-1 text-sm text-slate-700"
      >
        <li
          v-for="(entry, index) in leaderboardEntries"
          :key="entry.id"
          class="flex items-center justify-between rounded border border-slate-200 px-2 py-1.5"
        >
          <span class="font-medium text-slate-900">#{{ index + 1 }} {{ entry.playerName }}</span>
          <span>{{ entry.score }}</span>
          <span>{{ formatDuration(entry.durationMs) }}</span>
          <span class="text-xs uppercase text-slate-500">{{ entry.mode }}</span>
        </li>
      </ol>
    </section>

    <div class="grid w-full max-w-[220px] grid-cols-3 gap-2 sm:hidden">
      <div />
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="sendDirection('up')"
      >
        ↑
      </button>
      <div />
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="sendDirection('left')"
      >
        ←
      </button>
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="sendDirection('down')"
      >
        ↓
      </button>
      <button
        class="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900"
        @click="sendDirection('right')"
      >
        →
      </button>
    </div>

    <p class="text-center text-sm text-slate-600">
      Controls: Arrow keys / WASD, <kbd>Space</kbd> pause/ready, <kbd>R</kbd> restart.
    </p>
  </main>
</template>
