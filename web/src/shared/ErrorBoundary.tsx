// Root error boundary — catches rendering failures and reports via App Insights.
// Every route + feature root wraps in this per web-error-logging.md.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { trackException } from './appInsights';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    trackException(error, { componentStack: info.componentStack ?? '' });
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <main style={{ padding: 24 }}>
            <h1>Something went wrong.</h1>
            <p>Reload the page. If this keeps happening, contact your workspace admin.</p>
          </main>
        )
      );
    }
    return this.props.children;
  }
}
