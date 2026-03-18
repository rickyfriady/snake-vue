export type Direction = 'up' | 'down' | 'left' | 'right'
export type GameStatus = 'running' | 'game_over'

export interface Position {
  x: number
  y: number
}

export interface SnakeConfig {
  cols: number
  rows: number
  initialLength: number
}

export interface SnakeState {
  snake: Position[]
  direction: Direction
  food: Position
  score: number
  status: GameStatus
}
export type Randomizer = () => number
