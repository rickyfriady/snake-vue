import type { Direction, GameStatus, Position } from '../game/snake-engine'

export interface LeaderboardEntry {
  id: string
  playerName: string
  mode: 'solo' | 'daily'
  score: number
  durationMs: number
  maxLength: number
  endedAt: string
  dailyKey: string | null
}

export interface LeaderboardSubmitPayload {
  playerName: string
  mode: 'solo' | 'daily'
  score: number
  durationMs: number
  maxLength: number
  endedAt: string
  dailySeed?: number
}

export interface MultiplayerPlayerSnapshot {
  playerId: string
  playerName: string
  ready: boolean
  connected: boolean
  score: number
  status: GameStatus
  snake: Position[]
  food: Position
}

export interface MultiplayerRoomSnapshot {
  roomCode: string
  phase: 'waiting' | 'running' | 'finished'
  seed: number
  winnerId: string | null
  updatedAt: string
  players: MultiplayerPlayerSnapshot[]
}

export type MultiplayerClientEvent =
  | { type: 'create_room'; playerName: string }
  | { type: 'join_room'; roomCode: string; playerName: string }
  | { type: 'set_ready'; roomCode: string; ready: boolean }
  | { type: 'input'; roomCode: string; direction: Direction }
  | { type: 'restart_room'; roomCode: string }
  | { type: 'leave_room'; roomCode: string }

export type MultiplayerServerEvent =
  | { type: 'room_joined'; roomCode: string; playerId: string }
  | { type: 'room_state'; room: MultiplayerRoomSnapshot }
  | { type: 'room_error'; code: string; message: string }
