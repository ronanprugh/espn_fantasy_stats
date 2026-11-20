/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Sentry DSN; unset means no error reporting (lib/reporting.ts). */
  readonly VITE_SENTRY_DSN?: string
}
