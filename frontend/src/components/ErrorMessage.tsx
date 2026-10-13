import { RETRYABLE_ERRORS } from '../api'

/**
 * A page-level failure. Offers a reload only when retrying can help (a network
 * failure or a slow server), not for answers like "hasn't been played yet".
 */
export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      {message}
      {RETRYABLE_ERRORS.has(message) && (
        <button type="button" className="secondary-btn small error-retry" onClick={() => window.location.reload()}>
          Try again
        </button>
      )}
    </div>
  )
}
