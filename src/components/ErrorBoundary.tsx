import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; ref: string; }

function shortRef(): string {
  return Math.random().toString(16).slice(2, 6) + '-' + Math.random().toString(16).slice(2, 6);
}

/**
 * Catches render-time errors anywhere below it and shows the 500 screen
 * instead of a blank page. Pairs with Sentry, which still captures the error.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, ref: '' };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true, ref: shortRef() };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced to the console (and Sentry, if wired) for diagnosis.
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mas-app">
        <div className="mas-error">
          <div className="mas-error-card">
            <p className="mas-error-eyebrow">Error · Server</p>
            <div className="mas-error-code">500</div>
            <h1 className="mas-error-title">Something broke on our end</h1>
            <p className="mas-error-text">
              We&rsquo;ve logged the problem and are looking into it. Please try again in a
              moment, or head back to the dashboard.
            </p>
            <div className="mas-error-actions">
              <button className="mas-btn-primary" onClick={() => window.location.reload()}>Try again</button>
              <a className="mas-btn-secondary" href="/dashboard">Dashboard</a>
            </div>
            <div className="mas-error-meta">
              <b>STATUS</b> 500 &nbsp; <b>CODE</b> INTERNAL_ERROR &nbsp; <b>REF</b> {this.state.ref}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
