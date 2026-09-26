import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Optional custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Catches render-time crashes anywhere below it and shows a recoverable
 * "something went wrong" screen instead of a blank page.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    const { children, fallback } = this.props

    if (!error) return <>{children}</>
    if (fallback) return <>{fallback(error, this.reset)}</>

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-100 dark:bg-red-950 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            </svg>
          </div>
          <h1 className="mt-5 text-xl font-semibold text-gray-900 dark:text-gray-100">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
            An unexpected error occurred. Your data is safe — you can try again or reload the page.
          </p>

          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs text-gray-500 dark:text-gray-400 select-none">
              Technical details
            </summary>
            <pre className="mt-2 p-3 rounded-md bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40 whitespace-pre-wrap">
              {error.message}
            </pre>
          </details>

          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={this.reset}
              className="px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700"
            >
              Try again
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary