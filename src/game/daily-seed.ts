const formatDailyKey = (date: Date, timezone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(date)
}

export const createDailySeed = (date: Date = new Date(), timezone = 'UTC'): number => {
  const key = formatDailyKey(date, timezone)

  let hash = 2_166_136_261
  for (const character of key) {
    const codePoint = character.codePointAt(0)

    if (codePoint === undefined) {
      continue
    }

    hash ^= codePoint
    hash = Math.imul(hash, 16_777_619)
  }

  return hash >>> 0
}
