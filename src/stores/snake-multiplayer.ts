import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Direction, SnakeState } from '../game/snake-engine'
import type { MultiplayerRoomSnapshot, MultiplayerServerEvent } from '../types/snake-network'

import { useSnakeStore } from './snake'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

const getSocketUrl = (): string => {
  const protocol = globalThis.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${globalThis.location.host}/ws`
}

const decodeMessageData = (eventData: string | ArrayBuffer | Blob): Promise<string> => {
  if (typeof eventData === 'string') {
    return Promise.resolve(eventData)
  }

  if (eventData instanceof ArrayBuffer) {
    return Promise.resolve(new TextDecoder().decode(eventData))
  }

  return eventData.arrayBuffer().then((buffer) => new TextDecoder().decode(buffer))
}

export const useSnakeMultiplayerStore = defineStore('snake-multiplayer', () => {
  const snakeStore = useSnakeStore()
  const socket = ref<WebSocket | null>(null)
  const connectionStatus = ref<ConnectionStatus>('disconnected')
  const room = ref<MultiplayerRoomSnapshot | null>(null)
  const playerId = ref<string>('')
  const errorMessage = ref<string>('')

  const roomCode = computed(() => room.value?.roomCode ?? '')
  const hasRoom = computed(() => room.value !== null)
  const isReady = computed(() => {
    if (!room.value || playerId.value.length === 0) {
      return false
    }

    return room.value.players.some((player) => player.playerId === playerId.value && player.ready)
  })

  const localPlayer = computed(() => {
    if (!room.value || playerId.value.length === 0) {
      return null
    }

    return room.value.players.find((player) => player.playerId === playerId.value) ?? null
  })

  const opponentPlayer = computed(() => {
    if (!room.value || playerId.value.length === 0) {
      return null
    }

    return room.value.players.find((player) => player.playerId !== playerId.value) ?? null
  })

  const syncLocalSnakeState = (nextRoom: MultiplayerRoomSnapshot) => {
    if (snakeStore.mode !== 'multiplayer') {
      return
    }

    const player = nextRoom.players.find(
      (currentPlayer) => currentPlayer.playerId === playerId.value,
    )
    if (!player) {
      return
    }

    const externalState: SnakeState = {
      snake: player.snake,
      direction: snakeStore.state.direction,
      food: player.food,
      score: player.score,
      status: player.status,
    }

    snakeStore.applyExternalState(externalState)
  }

  const handleServerEvent = (event: MultiplayerServerEvent) => {
    if (event.type === 'room_error') {
      errorMessage.value = event.message
      return
    }

    if (event.type === 'room_joined') {
      playerId.value = event.playerId
      errorMessage.value = ''
      return
    }

    room.value = event.room
    errorMessage.value = ''
    syncLocalSnakeState(event.room)
  }

  const handleSocketMessage = async (eventData: string | ArrayBuffer | Blob) => {
    try {
      const decodedPayload = await decodeMessageData(eventData)
      const payload = JSON.parse(decodedPayload) as MultiplayerServerEvent
      handleServerEvent(payload)
    } catch {
      errorMessage.value = 'Invalid message from multiplayer server.'
    }
  }

  const closeSocket = () => {
    if (socket.value) {
      socket.value.close()
      socket.value = null
    }

    connectionStatus.value = 'disconnected'
  }

  const connect = (): Promise<void> => {
    if (connectionStatus.value === 'connected') {
      return Promise.resolve()
    }

    if (connectionStatus.value === 'connecting') {
      return Promise.resolve()
    }

    connectionStatus.value = 'connecting'

    return new Promise((resolve, reject) => {
      let settled = false
      const nextSocket = new WebSocket(getSocketUrl())

      nextSocket.addEventListener('open', () => {
        if (settled) {
          return
        }

        settled = true
        socket.value = nextSocket
        connectionStatus.value = 'connected'
        resolve()
      })

      nextSocket.addEventListener('message', (event) => {
        handleSocketMessage(event.data)
      })

      nextSocket.addEventListener('error', () => {
        errorMessage.value = 'Unable to connect to multiplayer server.'

        if (settled) {
          return
        }

        settled = true
        connectionStatus.value = 'disconnected'
        reject(new Error('Unable to connect to multiplayer server.'))
      })

      nextSocket.addEventListener('close', () => {
        connectionStatus.value = 'disconnected'
        socket.value = null
      })
    })
  }

  const sendEvent = async (payload: object) => {
    await connect()

    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      throw new Error('Multiplayer socket is not connected.')
    }

    socket.value.send(JSON.stringify(payload))
  }

  const createRoom = async (playerName: string) => {
    await sendEvent({
      type: 'create_room',
      playerName,
    })
  }

  const joinRoom = async (nextRoomCode: string, playerName: string) => {
    await sendEvent({
      type: 'join_room',
      roomCode: nextRoomCode,
      playerName,
    })
  }

  const setReady = async (ready: boolean) => {
    if (!room.value) {
      return
    }

    await sendEvent({
      type: 'set_ready',
      roomCode: room.value.roomCode,
      ready,
    })
  }

  const sendDirection = async (direction: Direction) => {
    if (!room.value) {
      return
    }

    await sendEvent({
      type: 'input',
      roomCode: room.value.roomCode,
      direction,
    })
  }

  const restartRoom = async () => {
    if (!room.value) {
      return
    }

    await sendEvent({
      type: 'restart_room',
      roomCode: room.value.roomCode,
    })
  }

  const leaveRoom = async () => {
    const currentRoomCode = room.value?.roomCode
    const canSendLeaveEvent =
      currentRoomCode !== undefined &&
      socket.value !== null &&
      socket.value.readyState === WebSocket.OPEN

    if (canSendLeaveEvent && currentRoomCode !== undefined) {
      await sendEvent({
        type: 'leave_room',
        roomCode: currentRoomCode,
      })
    }

    room.value = null
    playerId.value = ''
    closeSocket()
  }

  return {
    room,
    roomCode,
    hasRoom,
    isReady,
    localPlayer,
    opponentPlayer,
    playerId,
    errorMessage,
    connectionStatus,
    connect,
    createRoom,
    joinRoom,
    setReady,
    sendDirection,
    restartRoom,
    leaveRoom,
    closeSocket,
  }
})
