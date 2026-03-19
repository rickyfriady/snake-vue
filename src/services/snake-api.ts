import type { LeaderboardEntry, LeaderboardSubmitPayload } from '../types/snake-network'

export interface LeaderboardResponse {
  scope: 'daily' | 'all_time'
  entries: LeaderboardEntry[]
  generatedAt: string
}

export interface HealthResponse {
  status: string
  time: string
}

const ensureOk = async (response: Response): Promise<void> => {
  if (response.ok) {
    return
  }

  const message = await response.text()
  throw new Error(message || `Request failed with status ${response.status}`)
}

export const fetchLeaderboard = async (
  scope: 'daily' | 'all_time' = 'daily',
  limit = 20,
): Promise<LeaderboardResponse> => {
  const response = await fetch(`/api/leaderboard?scope=${scope}&limit=${limit}`)
  await ensureOk(response)

  const payload = (await response.json()) as LeaderboardResponse
  return payload
}

export const fetchBackendHealth = async (): Promise<HealthResponse> => {
  const response = await fetch('/api/health', {
    cache: 'no-store',
  })
  await ensureOk(response)

  const payload = (await response.json()) as HealthResponse
  return payload
}

export const submitLeaderboardEntry = async (
  payload: LeaderboardSubmitPayload,
): Promise<LeaderboardEntry> => {
  const response = await fetch('/api/leaderboard/submit', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  await ensureOk(response)

  const body = (await response.json()) as { ok: boolean; entry: LeaderboardEntry }
  return body.entry
}
