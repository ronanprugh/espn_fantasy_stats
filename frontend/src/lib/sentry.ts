/** Only what lib/reporting.ts uses of the Sentry SDK, so its lazily loaded
 * chunk is just that, not the whole SDK. */
export { init } from '@sentry/browser'
