import { describe, expect, it } from 'bun:test'

import { decodeClientEvent, parseJsonRecord, parseLeaderboardSubmission } from './index'

describe('snake server protocol validation', () => {
  it('parses valid json record and rejects malformed payload', () => {
    expect(parseJsonRecord('{"type":"create_room","playerName":"A"}')).not.toBeNull()
    expect(parseJsonRecord('{bad json')).toBeNull()
    expect(parseJsonRecord('[1,2,3]')).toBeNull()
  })

  it('decodes websocket client events with strict direction checks', () => {
    const validEventRecord = parseJsonRecord(
      '{"type":"input","roomCode":"AB12CD","direction":"left"}',
    )

    if (!validEventRecord) {
      throw new Error('Expected valid event record')
    }

    const validEvent = decodeClientEvent(validEventRecord)
    expect(validEvent).toEqual({
      type: 'input',
      roomCode: 'AB12CD',
      direction: 'left',
    })

    const invalidDirectionRecord = parseJsonRecord(
      '{"type":"input","roomCode":"AB12CD","direction":"north"}',
    )

    if (!invalidDirectionRecord) {
      throw new Error('Expected valid event record')
    }

    expect(decodeClientEvent(invalidDirectionRecord)).toBeNull()
  })

  it('validates leaderboard submission payload shape and ranges', () => {
    const validSubmissionRecord = parseJsonRecord(
      JSON.stringify({
        playerName: '  Test Player  ',
        mode: 'daily',
        score: 25,
        durationMs: 12_000,
        maxLength: 9,
        endedAt: '2026-03-19T00:00:00.000Z',
        dailySeed: 12_345,
      }),
    )

    if (!validSubmissionRecord) {
      throw new Error('Expected valid submission record')
    }

    const parsedSubmission = parseLeaderboardSubmission(validSubmissionRecord)
    expect(parsedSubmission).not.toBeNull()
    expect(parsedSubmission?.playerName).toBe('Test Player')
    expect(parsedSubmission?.mode).toBe('daily')

    const invalidSubmissionRecord = parseJsonRecord(
      JSON.stringify({
        playerName: 'Bad',
        mode: 'daily',
        score: -1,
        durationMs: 100,
        maxLength: 5,
        endedAt: '2026-03-19T00:00:00.000Z',
      }),
    )

    if (!invalidSubmissionRecord) {
      throw new Error('Expected valid submission record')
    }

    expect(parseLeaderboardSubmission(invalidSubmissionRecord)).toBeNull()
  })
})
