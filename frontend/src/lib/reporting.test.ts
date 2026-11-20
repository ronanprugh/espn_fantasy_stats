import type { ErrorEvent } from '@sentry/browser'
import { describe, expect, it } from 'vitest'
import { scrubEvent, startErrorReporting } from './reporting'

describe('scrubEvent', () => {
  it('keeps the URL and the error, and nothing that can carry a credential', () => {
    const event = scrubEvent({
      type: undefined,
      message: 'boom',
      request: { url: 'https://x/espn-fantasy-stats/team_hub', cookies: { session: 's' }, headers: { Cookie: 'c' } },
      user: { ip_address: '203.0.113.5' },
      extra: { league: { espn_s2: 's2', SWID: 'w', season: 2025 }, list: [{ token: 't' }] },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api/leagues/1/teams', Authorization: 'Bearer t' } }],
    } as ErrorEvent)
    expect(event).toEqual({
      message: 'boom',
      request: { url: 'https://x/espn-fantasy-stats/team_hub' },
      extra: { league: { espn_s2: '[Filtered]', SWID: '[Filtered]', season: 2025 }, list: [{ token: '[Filtered]' }] },
      breadcrumbs: [{ category: 'fetch', data: { url: '/api/leagues/1/teams', Authorization: '[Filtered]' } }],
    })
  })
})

describe('startErrorReporting', () => {
  it('is off without a DSN', async () => {
    expect(await startErrorReporting('')).toBe(false)
    expect(await startErrorReporting(undefined)).toBe(false)
  })
})
