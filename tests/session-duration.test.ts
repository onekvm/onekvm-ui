import assert from 'node:assert/strict'

import { formatSessionDuration } from '../src/lib/session-duration.ts'

const start = '2026-11-01T11:25:18.327Z'
const legacy = '1793532318.327Z'
const startMs = Date.parse(start)

for (const timestamp of [start, legacy, '2026-11-01T19:25:18.327+08:00']) {
	for (const [elapsed, expected] of [
		[0, '0s'], [999, '0s'], [1000, '1s'], [59_999, '59s'],
		[60_000, '1m 0s'], [3_599_999, '59m 59s'],
		[3_600_000, '1h 0m 0s'], [86_400_000, '1d 0h 0m'],
		[90_061_000, '1d 1h 1m'],
	] as const) {
		assert.equal(formatSessionDuration(timestamp, startMs + elapsed), expected)
	}
	assert.equal(formatSessionDuration(timestamp, startMs - 10_000), '0s')
}

for (const timestamp of ['', 'invalid', '1793532318.badZ']) {
	assert.equal(formatSessionDuration(timestamp, startMs), '-')
}
assert.equal(formatSessionDuration(start, Number.NaN), '-')

console.log('session-duration tests passed')
