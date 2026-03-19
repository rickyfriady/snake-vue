import {
  createInitialState,
  createSeededRandomizer,
  defaultSnakeConfig,
  stepSnake,
  type Direction,
  type Randomizer,
  type SnakeState,
} from '../src/game/snake-engine'
import type {
  LeaderboardEntry,
  LeaderboardSubmitPayload,
  MultiplayerClientEvent,
  MultiplayerRoomSnapshot,
  MultiplayerServerEvent,
} from '../src/types/snake-network'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonRecord | JsonValue[]
interface JsonRecord {
  [key: string]: JsonValue
}

interface SocketSessionData {
  ip: string
  playerId: string | null
  roomCode: string | null
  inputWindowStartedAt: number
  inputCount: number
}

interface RoomPlayerRuntime {
  playerId: string
  playerName: string
  ready: boolean
  connected: boolean
  state: SnakeState
  pendingDirection: Direction | null
  randomizer: Randomizer
}

interface RoomRuntime {
  roomCode: string
  phase: 'waiting' | 'running' | 'finished'
  seed: number
  winnerId: string | null
  updatedAt: string
  players: Map<string, RoomPlayerRuntime>
  tickTimer: ReturnType<typeof setInterval> | null
}

interface RateLimitWindow {
  startedAt: number
  count: number
}

const roomCodeLength = 6
const roomMaxPlayers = 2
const leaderboardCapacity = 500
const submissionRateLimitMax = 30
const submissionRateLimitWindowMs = 60_000
const websocketInputLimitMax = 80
const websocketInputLimitWindowMs = 1000
const websocketTickMs = 140
const defaultPort = 8787

const allowedRoomCodeCharacters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rooms = new Map<string, RoomRuntime>()
const socketsByPlayerId = new Map<string, Bun.ServerWebSocket<SocketSessionData>>()
const leaderboardEntries: LeaderboardEntry[] = []
const submitRateWindows = new Map<string, RateLimitWindow>()

const nowIso = (): string => new Date().toISOString()

const toDailyKey = (date: Date): string => date.toISOString().slice(0, 10)

const getSecureRandomUint32 = (): number => {
  if (globalThis.crypto !== undefined && typeof globalThis.crypto.getRandomValues === 'function') {
    const bytes = new Uint32Array(1)
    globalThis.crypto.getRandomValues(bytes)
    return bytes[0] ?? 0
  }

  const seed = Date.now()
  return (seed ^ (seed >>> 9) ^ (seed << 13)) >>> 0
}

const hashString = (value: string): number => {
  let hash = 2_166_136_261

  for (const character of value) {
    const codePoint = character.codePointAt(0)

    if (codePoint === undefined) {
      continue
    }

    hash ^= codePoint
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}

const normalizePlayerName = (name: string): string => {
  const normalized = name.trim().slice(0, 24)
  return normalized.length > 0 ? normalized : 'Player'
}

const createPlayerId = (): string => {
  return `p-${Date.now()}-${getSecureRandomUint32()}`
}

const createRoomCode = (): string => {
  const bytes = new Uint8Array(roomCodeLength)

  for (;;) {
    if (
      globalThis.crypto !== undefined &&
      typeof globalThis.crypto.getRandomValues === 'function'
    ) {
      globalThis.crypto.getRandomValues(bytes)
    } else {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = getSecureRandomUint32() % 256
      }
    }

    let roomCode = ''
    for (const byte of bytes) {
      const rawValue = byte ?? 0
      roomCode += allowedRoomCodeCharacters[rawValue % allowedRoomCodeCharacters.length] ?? 'A'
    }

    if (!rooms.has(roomCode)) {
      return roomCode
    }
  }
}

export const parseJsonRecord = (payload: string): JsonRecord | null => {
  try {
    const parsed = JSON.parse(payload) as JsonValue

    if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
      return null
    }

    return parsed as JsonRecord
  } catch {
    return null
  }
}

const readStringField = (record: JsonRecord, key: string): string | null => {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

const readIntegerField = (record: JsonRecord, key: string): number | null => {
  const value = record[key]
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

const readOptionalIntegerField = (record: JsonRecord, key: string): number | null | undefined => {
  const value = record[key]

  if (value === undefined) {
    return undefined
  }

  return typeof value === 'number' && Number.isInteger(value) ? value : null
}

const readBooleanField = (record: JsonRecord, key: string): boolean | null => {
  const value = record[key]
  return typeof value === 'boolean' ? value : null
}

const isDirection = (value: string): value is Direction =>
  value === 'up' || value === 'down' || value === 'left' || value === 'right'

const parseCreateRoomEvent = (record: JsonRecord): MultiplayerClientEvent | null => {
  const playerName = readStringField(record, 'playerName')

  if (playerName === null) {
    return null
  }

  return { type: 'create_room', playerName }
}

const parseJoinRoomEvent = (record: JsonRecord): MultiplayerClientEvent | null => {
  const roomCode = readStringField(record, 'roomCode')
  const playerName = readStringField(record, 'playerName')

  if (roomCode === null || playerName === null) {
    return null
  }

  return { type: 'join_room', roomCode: roomCode.toUpperCase(), playerName }
}

const parseSetReadyEvent = (record: JsonRecord): MultiplayerClientEvent | null => {
  const roomCode = readStringField(record, 'roomCode')
  const ready = readBooleanField(record, 'ready')

  if (roomCode === null || ready === null) {
    return null
  }

  return { type: 'set_ready', roomCode: roomCode.toUpperCase(), ready }
}

const parseInputEvent = (record: JsonRecord): MultiplayerClientEvent | null => {
  const roomCode = readStringField(record, 'roomCode')
  const direction = readStringField(record, 'direction')

  if (roomCode === null || direction === null || !isDirection(direction)) {
    return null
  }

  return { type: 'input', roomCode: roomCode.toUpperCase(), direction }
}

const parseRoomCodeOnlyEvent = (
  record: JsonRecord,
  eventType: 'restart_room' | 'leave_room',
): MultiplayerClientEvent | null => {
  const roomCode = readStringField(record, 'roomCode')

  if (roomCode === null) {
    return null
  }

  return { type: eventType, roomCode: roomCode.toUpperCase() }
}

export const decodeClientEvent = (record: JsonRecord): MultiplayerClientEvent | null => {
  const eventType = readStringField(record, 'type')

  if (eventType === null) {
    return null
  }

  switch (eventType) {
    case 'create_room': {
      return parseCreateRoomEvent(record)
    }
    case 'join_room': {
      return parseJoinRoomEvent(record)
    }
    case 'set_ready': {
      return parseSetReadyEvent(record)
    }
    case 'input': {
      return parseInputEvent(record)
    }
    case 'restart_room': {
      return parseRoomCodeOnlyEvent(record, 'restart_room')
    }
    case 'leave_room': {
      return parseRoomCodeOnlyEvent(record, 'leave_room')
    }
    default: {
      return null
    }
  }
}

const isSubmissionRateLimited = (key: string): boolean => {
  const now = Date.now()
  const window = submitRateWindows.get(key)

  if (!window || now - window.startedAt > submissionRateLimitWindowMs) {
    submitRateWindows.set(key, { startedAt: now, count: 1 })
    return false
  }

  if (window.count >= submissionRateLimitMax) {
    return true
  }

  window.count += 1
  return false
}

export const parseLeaderboardSubmission = (record: JsonRecord): LeaderboardSubmitPayload | null => {
  const playerName = readStringField(record, 'playerName')
  const mode = readStringField(record, 'mode')
  const score = readIntegerField(record, 'score')
  const durationMs = readIntegerField(record, 'durationMs')
  const maxLength = readIntegerField(record, 'maxLength')
  const endedAt = readStringField(record, 'endedAt')
  const dailySeed = readOptionalIntegerField(record, 'dailySeed')

  if (
    playerName === null ||
    mode === null ||
    score === null ||
    durationMs === null ||
    maxLength === null ||
    endedAt === null
  ) {
    return null
  }

  if (mode !== 'solo' && mode !== 'daily') {
    return null
  }

  if (score < 0 || durationMs < 0 || maxLength <= 0 || score > 200_000) {
    return null
  }

  if (dailySeed === null) {
    return null
  }

  const endedAtDate = new Date(endedAt)
  if (Number.isNaN(endedAtDate.valueOf())) {
    return null
  }

  const optionalDailySeed = dailySeed === undefined ? {} : { dailySeed }

  return {
    playerName: normalizePlayerName(playerName),
    mode,
    score,
    durationMs,
    maxLength,
    endedAt: endedAtDate.toISOString(),
    ...optionalDailySeed,
  }
}

const toLeaderboardEntry = (submission: LeaderboardSubmitPayload): LeaderboardEntry => {
  const endedDate = new Date(submission.endedAt)

  return {
    id: `${endedDate.getTime()}-${getSecureRandomUint32()}`,
    playerName: submission.playerName,
    mode: submission.mode,
    score: submission.score,
    durationMs: submission.durationMs,
    maxLength: submission.maxLength,
    endedAt: submission.endedAt,
    dailyKey: submission.mode === 'daily' ? toDailyKey(endedDate) : null,
  }
}

const sortLeaderboardEntries = (entries: LeaderboardEntry[]): LeaderboardEntry[] => {
  return entries.toSorted((first, second) => {
    if (first.score !== second.score) {
      return second.score - first.score
    }

    if (first.durationMs !== second.durationMs) {
      return first.durationMs - second.durationMs
    }

    return first.endedAt.localeCompare(second.endedAt)
  })
}

const createRoomSnapshot = (room: RoomRuntime): MultiplayerRoomSnapshot => {
  const players = [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    playerName: player.playerName,
    ready: player.ready,
    connected: player.connected,
    score: player.state.score,
    status: player.state.status,
    snake: player.state.snake,
    food: player.state.food,
  }))

  return {
    roomCode: room.roomCode,
    phase: room.phase,
    seed: room.seed,
    winnerId: room.winnerId,
    updatedAt: room.updatedAt,
    players,
  }
}

const emitToSocket = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  event: MultiplayerServerEvent,
) => {
  socket.send(JSON.stringify(event))
}

const emitRoomError = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  code: string,
  message: string,
) => {
  emitToSocket(socket, { type: 'room_error', code, message })
}

const broadcastRoom = (room: RoomRuntime) => {
  const payload: MultiplayerServerEvent = { type: 'room_state', room: createRoomSnapshot(room) }

  for (const player of room.players.values()) {
    const socket = socketsByPlayerId.get(player.playerId)

    if (socket) {
      emitToSocket(socket, payload)
    }
  }
}

const clearRoomTimer = (room: RoomRuntime) => {
  if (room.tickTimer !== null) {
    clearInterval(room.tickTimer)
    room.tickTimer = null
  }
}

const removeRoomIfEmpty = (room: RoomRuntime) => {
  if (room.players.size === 0) {
    clearRoomTimer(room)
    rooms.delete(room.roomCode)
  }
}

const createPlayerRuntime = (
  roomSeed: number,
  playerId: string,
  playerName: string,
): RoomPlayerRuntime => {
  const playerSeed = (roomSeed ^ hashString(playerId)) >>> 0
  const randomizer = createSeededRandomizer(playerSeed)
  const initialState = createInitialState(defaultSnakeConfig, randomizer)

  return {
    playerId,
    playerName,
    ready: false,
    connected: true,
    state: initialState,
    pendingDirection: null,
    randomizer,
  }
}

const assignRoomToSocket = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  roomCode: string,
  playerId: string,
) => {
  socket.data.roomCode = roomCode
  socket.data.playerId = playerId
  socketsByPlayerId.set(playerId, socket)
}

const getWinningPlayerId = (room: RoomRuntime): string | null => {
  let winner: RoomPlayerRuntime | null = null
  let hasTie = false

  for (const player of room.players.values()) {
    if (winner === null || player.state.score > winner.state.score) {
      winner = player
      hasTie = false
      continue
    }

    if (winner.state.score === player.state.score) {
      hasTie = true
    }
  }

  if (winner === null || hasTie) {
    return null
  }

  return winner.playerId
}

const finishRoomMatch = (room: RoomRuntime) => {
  room.phase = 'finished'
  room.winnerId = getWinningPlayerId(room)
  room.updatedAt = nowIso()
  clearRoomTimer(room)
}

const startRoomMatch = (room: RoomRuntime) => {
  room.phase = 'running'
  room.winnerId = null
  room.updatedAt = nowIso()

  for (const player of room.players.values()) {
    const playerSeed = (room.seed ^ hashString(player.playerId)) >>> 0
    player.randomizer = createSeededRandomizer(playerSeed)
    player.state = createInitialState(defaultSnakeConfig, player.randomizer)
    player.state.status = 'running'
    player.pendingDirection = null
  }

  clearRoomTimer(room)
  room.tickTimer = setInterval(() => {
    if (room.phase !== 'running') {
      return
    }

    let hasRunningPlayer = false

    for (const player of room.players.values()) {
      if (!player.connected && player.state.status === 'running') {
        player.state.status = 'game_over'
      }

      if (player.state.status !== 'running') {
        continue
      }

      player.state = stepSnake(
        player.state,
        defaultSnakeConfig,
        player.pendingDirection,
        player.randomizer,
      )
      player.pendingDirection = null

      if (player.state.status === 'running') {
        hasRunningPlayer = true
      }
    }

    if (hasRunningPlayer) {
      room.updatedAt = nowIso()
    } else {
      finishRoomMatch(room)
    }

    broadcastRoom(room)
  }, websocketTickMs)
}

const maybeStartReadyRoom = (room: RoomRuntime) => {
  if (room.phase !== 'waiting' || room.players.size !== roomMaxPlayers) {
    return
  }

  const allReady = [...room.players.values()].every((player) => player.connected && player.ready)

  if (allReady) {
    startRoomMatch(room)
  }
}

const clearSocketSession = (socket: Bun.ServerWebSocket<SocketSessionData>) => {
  if (socket.data.playerId) {
    socketsByPlayerId.delete(socket.data.playerId)
  }

  socket.data.playerId = null
  socket.data.roomCode = null
  socket.data.inputCount = 0
  socket.data.inputWindowStartedAt = 0
}

const removePlayerFromRoom = (room: RoomRuntime, playerId: string) => {
  room.players.delete(playerId)
  room.updatedAt = nowIso()
  removeRoomIfEmpty(room)
}

const handleCreateRoom = (socket: Bun.ServerWebSocket<SocketSessionData>, playerName: string) => {
  if (socket.data.playerId !== null) {
    emitRoomError(socket, 'already_in_room', 'Leave the current room first.')
    return
  }

  const roomCode = createRoomCode()
  const roomSeed = getSecureRandomUint32()
  const room: RoomRuntime = {
    roomCode,
    phase: 'waiting',
    seed: roomSeed,
    winnerId: null,
    updatedAt: nowIso(),
    players: new Map<string, RoomPlayerRuntime>(),
    tickTimer: null,
  }

  const playerId = createPlayerId()
  const player = createPlayerRuntime(roomSeed, playerId, normalizePlayerName(playerName))
  room.players.set(playerId, player)
  rooms.set(roomCode, room)
  assignRoomToSocket(socket, roomCode, playerId)
  emitToSocket(socket, { type: 'room_joined', roomCode, playerId })
  broadcastRoom(room)
}

const handleJoinRoom = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  roomCode: string,
  playerName: string,
) => {
  if (socket.data.playerId !== null) {
    emitRoomError(socket, 'already_in_room', 'Leave the current room first.')
    return
  }

  const room = rooms.get(roomCode)
  if (!room) {
    emitRoomError(socket, 'room_not_found', 'Room code not found.')
    return
  }

  if (room.phase !== 'waiting') {
    emitRoomError(socket, 'room_locked', 'Room already running or finished.')
    return
  }

  if (room.players.size >= roomMaxPlayers) {
    emitRoomError(socket, 'room_full', 'Room is already full.')
    return
  }

  const playerId = createPlayerId()
  const player = createPlayerRuntime(room.seed, playerId, normalizePlayerName(playerName))
  room.players.set(playerId, player)
  room.updatedAt = nowIso()
  assignRoomToSocket(socket, roomCode, playerId)
  emitToSocket(socket, { type: 'room_joined', roomCode, playerId })
  broadcastRoom(room)
}

const getRoomAndPlayer = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  roomCode: string,
): { room: RoomRuntime; player: RoomPlayerRuntime } | null => {
  const playerId = socket.data.playerId
  if (playerId === null) {
    return null
  }

  const room = rooms.get(roomCode)
  if (!room) {
    return null
  }

  const player = room.players.get(playerId)
  if (!player) {
    return null
  }

  return { room, player }
}

const handleReady = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  roomCode: string,
  ready: boolean,
) => {
  const roomAndPlayer = getRoomAndPlayer(socket, roomCode)

  if (!roomAndPlayer) {
    emitRoomError(socket, 'room_state_invalid', 'Unable to update ready state.')
    return
  }

  if (roomAndPlayer.room.phase !== 'waiting') {
    emitRoomError(socket, 'room_locked', 'Room is not waiting for ready state.')
    return
  }

  roomAndPlayer.player.ready = ready
  roomAndPlayer.room.updatedAt = nowIso()
  maybeStartReadyRoom(roomAndPlayer.room)
  broadcastRoom(roomAndPlayer.room)
}

const consumeInputWindow = (socket: Bun.ServerWebSocket<SocketSessionData>): boolean => {
  const now = Date.now()
  if (now - socket.data.inputWindowStartedAt > websocketInputLimitWindowMs) {
    socket.data.inputWindowStartedAt = now
    socket.data.inputCount = 1
    return true
  }

  if (socket.data.inputCount >= websocketInputLimitMax) {
    return false
  }

  socket.data.inputCount += 1
  return true
}

const handleInput = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  roomCode: string,
  direction: Direction,
) => {
  if (!consumeInputWindow(socket)) {
    emitRoomError(socket, 'rate_limited', 'Input rate exceeded.')
    return
  }

  const roomAndPlayer = getRoomAndPlayer(socket, roomCode)
  if (!roomAndPlayer) {
    emitRoomError(socket, 'room_state_invalid', 'Unable to send input.')
    return
  }

  if (roomAndPlayer.room.phase !== 'running' || roomAndPlayer.player.state.status !== 'running') {
    return
  }

  roomAndPlayer.player.pendingDirection = direction
}

const handleRestartRoom = (socket: Bun.ServerWebSocket<SocketSessionData>, roomCode: string) => {
  const roomAndPlayer = getRoomAndPlayer(socket, roomCode)

  if (!roomAndPlayer) {
    emitRoomError(socket, 'room_state_invalid', 'Unable to restart room.')
    return
  }

  if (roomAndPlayer.room.phase !== 'finished') {
    emitRoomError(socket, 'room_not_finished', 'Room can only restart after match end.')
    return
  }

  roomAndPlayer.room.phase = 'waiting'
  roomAndPlayer.room.winnerId = null
  roomAndPlayer.room.updatedAt = nowIso()

  for (const player of roomAndPlayer.room.players.values()) {
    player.ready = false
    player.pendingDirection = null
    player.randomizer = createSeededRandomizer(
      (roomAndPlayer.room.seed ^ hashString(player.playerId)) >>> 0,
    )
    player.state = createInitialState(defaultSnakeConfig, player.randomizer)
  }

  broadcastRoom(roomAndPlayer.room)
}

const handleLeaveRoom = (socket: Bun.ServerWebSocket<SocketSessionData>, roomCode: string) => {
  const playerId = socket.data.playerId
  const room = rooms.get(roomCode)

  if (!room || playerId === null) {
    clearSocketSession(socket)
    return
  }

  clearSocketSession(socket)
  removePlayerFromRoom(room, playerId)

  if (rooms.has(roomCode)) {
    broadcastRoom(room)
  }
}

const handleSocketClose = (socket: Bun.ServerWebSocket<SocketSessionData>) => {
  const playerId = socket.data.playerId
  const roomCode = socket.data.roomCode

  clearSocketSession(socket)

  if (playerId === null || roomCode === null) {
    return
  }

  const room = rooms.get(roomCode)
  if (!room) {
    return
  }

  const player = room.players.get(playerId)
  if (!player) {
    return
  }

  if (room.phase === 'waiting') {
    room.players.delete(playerId)
    room.updatedAt = nowIso()
    removeRoomIfEmpty(room)

    if (rooms.has(roomCode)) {
      broadcastRoom(room)
    }

    return
  }

  player.connected = false
  player.ready = false

  if (player.state.status === 'running') {
    player.state.status = 'game_over'
  }

  if (room.phase === 'running') {
    const hasRunningPlayer = [...room.players.values()].some(
      (currentPlayer) => currentPlayer.state.status === 'running',
    )

    if (!hasRunningPlayer) {
      finishRoomMatch(room)
    }
  }

  room.updatedAt = nowIso()
  broadcastRoom(room)
}

const jsonResponse = (body: string, status = 200): Response =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const resolveClientIp = (request: Request): string => {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded && forwarded.trim().length > 0) {
    return forwarded.split(',')[0]?.trim() ?? 'unknown'
  }

  return request.headers.get('x-real-ip') ?? 'unknown'
}

const createSocketSessionData = (ip: string): SocketSessionData => ({
  ip,
  playerId: null,
  roomCode: null,
  inputWindowStartedAt: 0,
  inputCount: 0,
})

const handleWebSocketUpgrade = (
  request: Request,
  server: Bun.Server<SocketSessionData>,
): Response | undefined => {
  const ip = resolveClientIp(request)
  const upgraded = server.upgrade(request, {
    data: createSocketSessionData(ip),
  })

  if (upgraded) {
    return undefined
  }

  return new Response('WebSocket upgrade failed', { status: 400 })
}

const parseLeaderboardLimit = (rawLimit: string | null): number => {
  const parsedLimit = Number.parseInt(rawLimit ?? '20', 10)
  return Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 100) : 20
}

const handleLeaderboardRead = (url: URL): Response => {
  const scope = url.searchParams.get('scope') === 'daily' ? 'daily' : 'all_time'
  const limit = parseLeaderboardLimit(url.searchParams.get('limit'))
  const todayKey = toDailyKey(new Date())
  const scopedEntries =
    scope === 'daily'
      ? leaderboardEntries.filter((entry) => entry.dailyKey === todayKey)
      : leaderboardEntries

  const sortedEntries = sortLeaderboardEntries(scopedEntries)
  return jsonResponse(
    JSON.stringify({
      scope,
      entries: sortedEntries.slice(0, limit),
      generatedAt: nowIso(),
    }),
  )
}

const handleLeaderboardSubmit = (request: Request): Promise<Response> => {
  const ip = resolveClientIp(request)

  if (isSubmissionRateLimited(ip)) {
    return Promise.resolve(jsonResponse(JSON.stringify({ error: 'Rate limit exceeded.' }), 429))
  }

  return request
    .text()
    .then((body) => {
      if (body.length > 2048) {
        return jsonResponse(JSON.stringify({ error: 'Payload too large.' }), 413)
      }

      const record = parseJsonRecord(body)
      if (!record) {
        return jsonResponse(JSON.stringify({ error: 'Invalid JSON payload.' }), 400)
      }

      const payload = parseLeaderboardSubmission(record)
      if (!payload) {
        return jsonResponse(JSON.stringify({ error: 'Invalid leaderboard payload.' }), 400)
      }

      const entry = toLeaderboardEntry(payload)
      leaderboardEntries.unshift(entry)

      if (leaderboardEntries.length > leaderboardCapacity) {
        leaderboardEntries.length = leaderboardCapacity
      }

      return jsonResponse(JSON.stringify({ ok: true, entry }))
    })
    .catch(() => jsonResponse(JSON.stringify({ error: 'Unable to parse payload.' }), 400))
}

const handleHttpRequest = (
  request: Request,
  server: Bun.Server<SocketSessionData>,
): Response | Promise<Response> | undefined => {
  const url = new URL(request.url)

  if (url.pathname === '/ws') {
    return handleWebSocketUpgrade(request, server)
  }

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return jsonResponse(JSON.stringify({ status: 'ok', time: nowIso() }))
  }

  if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
    return handleLeaderboardRead(url)
  }

  if (url.pathname === '/api/leaderboard/submit' && request.method === 'POST') {
    return handleLeaderboardSubmit(request)
  }

  return new Response('Not Found', { status: 404 })
}

const snakeServerPortKey = 'SNAKE_SERVER_PORT' as const
const portFromEnv = Number.parseInt(Bun.env[snakeServerPortKey] ?? `${defaultPort}`, 10)
const resolvedDefaultPort =
  Number.isFinite(portFromEnv) && portFromEnv > 0 ? portFromEnv : defaultPort

const handleSocketMessage = (
  socket: Bun.ServerWebSocket<SocketSessionData>,
  rawMessage: string | Uint8Array,
) => {
  const payload = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage)
  const record = parseJsonRecord(payload)

  if (!record) {
    emitRoomError(socket, 'invalid_payload', 'Invalid message payload.')
    return
  }

  const event = decodeClientEvent(record)
  if (!event) {
    emitRoomError(socket, 'invalid_event', 'Unsupported event payload.')
    return
  }

  if (event.type === 'create_room') {
    handleCreateRoom(socket, event.playerName)
    return
  }

  if (event.type === 'join_room') {
    handleJoinRoom(socket, event.roomCode, event.playerName)
    return
  }

  if (event.type === 'set_ready') {
    handleReady(socket, event.roomCode, event.ready)
    return
  }

  if (event.type === 'input') {
    handleInput(socket, event.roomCode, event.direction)
    return
  }

  if (event.type === 'restart_room') {
    handleRestartRoom(socket, event.roomCode)
    return
  }

  handleLeaveRoom(socket, event.roomCode)
}

export const resetSnakeServerState = () => {
  for (const room of rooms.values()) {
    clearRoomTimer(room)
  }

  rooms.clear()
  socketsByPlayerId.clear()
  leaderboardEntries.length = 0
  submitRateWindows.clear()
}

export const createSnakeServer = (
  port: number = resolvedDefaultPort,
): Bun.Server<SocketSessionData> => {
  return Bun.serve<SocketSessionData>({
    port,
    fetch: handleHttpRequest,
    websocket: {
      message(socket, rawMessage) {
        handleSocketMessage(socket, rawMessage)
      },
      close(socket) {
        handleSocketClose(socket)
      },
    },
  })
}

if (import.meta.main) {
  createSnakeServer()
}
