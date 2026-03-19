export type GameMode = 'solo' | 'daily' | 'multiplayer'

export interface RunResult {
  id: string
  mode: GameMode
  score: number
  maxLength: number
  durationMs: number
  endedAt: string
}

export interface PlayerProfile {
  name: string
  bestScore: number
  history: RunResult[]
}
