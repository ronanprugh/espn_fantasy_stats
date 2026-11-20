/**
 * Error reporting to Sentry, off unless the build has VITE_SENTRY_DSN. The
 * SDK is its own chunk, fetched only when a DSN is set, so the app pays
 * nothing for it otherwise.
 *
 * Reports carry the page URL, the error and its stack. Never cookies, request
 * headers, the user, or form contents, and any field named like a credential
 * is filtered wherever it appears (`scrubEvent`).
 */
import type { ErrorEvent } from '@sentry/browser'

/** Field names, compared lowercased, whose values are never sent. */
const CREDENTIAL_KEYS = new Set([
  'espn_s2', 'swid', 's2', 'cookie', 'cookies', 'authorization', 'token', 'password',
  'current_password', 'new_password', 'invite_code', 'session',
])
const FILTERED = '[Filtered]'

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, CREDENTIAL_KEYS.has(k.toLowerCase()) ? FILTERED : scrub(v)]),
    )
  }
  return value
}

/** Last pass over a report before it's sent (Sentry's `beforeSend`). */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { url } = event.request
    event.request = url === undefined ? {} : { url }
  }
  delete event.user
  const scrubbed = event as unknown as Record<string, unknown>
  for (const key of ['extra', 'contexts', 'breadcrumbs', 'tags']) {
    if (key in scrubbed) scrubbed[key] = scrub(scrubbed[key])
  }
  return event
}

/** Start Sentry if this build has a DSN; resolves true if it started. */
export async function startErrorReporting(dsn = import.meta.env.VITE_SENTRY_DSN): Promise<boolean> {
  if (!dsn) return false
  const { init } = await import('./sentry')
  init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
  })
  return true
}
