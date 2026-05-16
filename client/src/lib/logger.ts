/**
 * Conditional debug logging utility for development-only logging
 * Only logs when running in development mode (import.meta.env.DEV)
 */


export const logger = {
  /**
   * Development-only log
   * @param message The message to log
   * @param data Optional data to log
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Logger intentionally accepts any data
  debug: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- Logger intentionally uses console
      console.log(`[App] ${message}`, data)
    }
  },

  /**
   * Development-only warning
   * @param message The message to warn about
   * @param data Optional data to include
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Logger intentionally accepts any data
  warn: (message: string, data?: any) => {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console -- Logger intentionally uses console
      console.warn(`[App] ${message}`, data)
    }
  },

  /**
   * Error logging (always logs in production, with dev prefix)
   * @param message The error message
   * @param error Optional error object
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Logger intentionally accepts any data
  error: (message: string, error?: any) => {
    // eslint-disable-next-line no-console -- Logger intentionally uses console
    console.error(`[App] ${message}:`, error)
  },
}
