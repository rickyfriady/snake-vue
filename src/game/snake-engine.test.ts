import { describe, expect, it } from 'bun:test'
import {
  createInitialState,
  isOppositeDirection,
  spawnFood,
  stepSnake,
  type SnakeConfig,
  type SnakeState,
} from './snake-engine'

const config: SnakeConfig = {
  cols: 6,
  rows: 6,
  initialLength: 3,
}

const baseState: SnakeState = {
  snake: [
    { x: 2, y: 2 },
    { x: 1, y: 2 },
    { x: 0, y: 2 },
  ],
  direction: 'right',
  food: { x: 5, y: 5 },
  score: 0,
  status: 'running',
}

describe('snake-engine', () => {
  it('moves one cell per tick in current direction', () => {
    const next = stepSnake(baseState, config)
    expect(next.snake[0]).toEqual({ x: 3, y: 2 })
    expect(next.snake).toHaveLength(3)
  })

  it('ignores direct reverse direction', () => {
    const next = stepSnake(baseState, config, 'left')
    expect(next.direction).toBe('right')
    expect(next.snake[0]).toEqual({ x: 3, y: 2 })
  })

  it('marks game over on wall collision', () => {
    const state: SnakeState = {
      ...baseState,
      snake: [
        { x: 5, y: 2 },
        { x: 4, y: 2 },
        { x: 3, y: 2 },
      ],
    }

    const next = stepSnake(state, config)
    expect(next.status).toBe('game_over')
  })

  it('marks game over on self collision', () => {
    const state: SnakeState = {
      ...baseState,
      direction: 'left',
      snake: [
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 2, y: 3 },
        { x: 2, y: 2 },
        { x: 2, y: 1 },
      ],
      food: { x: 5, y: 5 },
    }

    const next = stepSnake(state, config)
    expect(next.status).toBe('game_over')
  })

  it('grows snake and increments score when food is eaten', () => {
    const state: SnakeState = {
      ...baseState,
      food: { x: 3, y: 2 },
    }

    const next = stepSnake(state, config, null, () => 0)
    expect(next.snake).toHaveLength(4)
    expect(next.score).toBe(1)
    expect(next.food).not.toEqual({ x: 3, y: 2 })
  })

  it('spawns food only on empty cells', () => {
    const snake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]
    const food = spawnFood(config, snake, () => 0)

    expect(food).not.toBeNull()
    expect(
      snake.some((segment) => segment.x === food?.x && segment.y === food?.y),
    ).toBeFalse()
  })

  it('returns null food when board is full', () => {
    const fullBoardSnake = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]
    const food = spawnFood(
      { cols: 2, rows: 2, initialLength: 2 },
      fullBoardSnake,
    )
    expect(food).toBeNull()
  })

  it('creates initial state with deterministic food placement when randomizer is fixed', () => {
    const initialState = createInitialState(config, () => 0)
    expect(initialState.status).toBe('idle')
    expect(initialState.food).not.toEqual(initialState.snake[0])
  })

  it('validates opposite direction helper', () => {
    expect(isOppositeDirection('up', 'down')).toBeTrue()
    expect(isOppositeDirection('left', 'up')).toBeFalse()
  })
})
