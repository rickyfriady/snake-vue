export type Direction = 'up' | 'down' | 'left' | 'right'

export type GameStatus = 'idle' | 'running' | 'paused' | 'game_over'

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

export const defaultSnakeConfig: SnakeConfig = {
  cols: 20,
  rows: 20,
  initialLength: 3,
}

const directionDelta: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export const isOppositeDirection = (
  current: Direction,
  next: Direction,
): boolean => {
  return (
    (current === 'up' && next === 'down') ||
    (current === 'down' && next === 'up') ||
    (current === 'left' && next === 'right') ||
    (current === 'right' && next === 'left')
  )
}

const isSameCell = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y

const isOutOfBounds = (position: Position, config: SnakeConfig): boolean =>
  position.x < 0 ||
  position.y < 0 ||
  position.x >= config.cols ||
  position.y >= config.rows

const createInitialSnake = (config: SnakeConfig): Position[] => {
  const centerX = Math.floor(config.cols / 2)
  const centerY = Math.floor(config.rows / 2)

  return Array.from({ length: config.initialLength }, (_, index) => ({
    x: centerX - index,
    y: centerY,
  }))
}

const listEmptyCells = (config: SnakeConfig, snake: Position[]): Position[] => {
  const snakeCells = new Set(
    snake.map((segment) => `${segment.x}:${segment.y}`),
  )
  const emptyCells: Position[] = []

  for (let y = 0; y < config.rows; y += 1) {
    for (let x = 0; x < config.cols; x += 1) {
      const key = `${x}:${y}`

      if (!snakeCells.has(key)) {
        emptyCells.push({ x, y })
      }
    }
  }

  return emptyCells
}

export const spawnFood = (
  config: SnakeConfig,
  snake: Position[],
  randomizer: Randomizer = Math.random,
): Position | null => {
  const emptyCells = listEmptyCells(config, snake)

  if (emptyCells.length === 0) {
    return null
  }

  const selectedIndex = Math.floor(randomizer() * emptyCells.length)
  return emptyCells[selectedIndex] ?? emptyCells[0]
}

export const createInitialState = (
  config: SnakeConfig = defaultSnakeConfig,
  randomizer: Randomizer = Math.random,
): SnakeState => {
  const snake = createInitialSnake(config)
  const food = spawnFood(config, snake, randomizer)

  if (!food) {
    throw new Error('Cannot place food on a full board.')
  }

  return {
    snake,
    direction: 'right',
    food,
    score: 0,
    status: 'idle',
  }
}

const resolveDirection = (
  currentDirection: Direction,
  requestedDirection: Direction | null,
): Direction => {
  if (!requestedDirection) {
    return currentDirection
  }

  if (isOppositeDirection(currentDirection, requestedDirection)) {
    return currentDirection
  }

  return requestedDirection
}

const nextHeadPosition = (head: Position, direction: Direction): Position => {
  const delta = directionDelta[direction]
  return {
    x: head.x + delta.x,
    y: head.y + delta.y,
  }
}

export const stepSnake = (
  state: SnakeState,
  config: SnakeConfig = defaultSnakeConfig,
  requestedDirection: Direction | null = null,
  randomizer: Randomizer = Math.random,
): SnakeState => {
  const direction = resolveDirection(state.direction, requestedDirection)
  const head = state.snake[0]
  const newHead = nextHeadPosition(head, direction)

  if (isOutOfBounds(newHead, config)) {
    return {
      ...state,
      direction,
      status: 'game_over',
    }
  }

  const isEating = isSameCell(newHead, state.food)
  const collisionTargets = isEating ? state.snake : state.snake.slice(0, -1)
  const hasSelfCollision = collisionTargets.some((segment) =>
    isSameCell(segment, newHead),
  )

  if (hasSelfCollision) {
    return {
      ...state,
      direction,
      status: 'game_over',
    }
  }

  const nextSnake = [newHead, ...state.snake]

  if (!isEating) {
    nextSnake.pop()
  }

  if (!isEating) {
    return {
      ...state,
      snake: nextSnake,
      direction,
      status: 'running',
    }
  }

  const nextFood = spawnFood(config, nextSnake, randomizer)

  return {
    ...state,
    snake: nextSnake,
    direction,
    food: nextFood ?? state.food,
    score: state.score + 1,
    status: nextFood ? 'running' : 'game_over',
  }
}
