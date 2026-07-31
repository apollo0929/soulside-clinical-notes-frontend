import { Component, type ErrorInfo, type ReactNode } from 'react'

type ErrorBoundaryProps = {
  children: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  message: string | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = {
    hasError: false,
    message: null,
  }

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Unhandled application error', error, errorInfo)
  }

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main role="alert">
          <h1>Something went wrong</h1>
          <p>{this.state.message ?? 'An unexpected error occurred.'}</p>
        </main>
      )
    }

    return this.props.children
  }
}
