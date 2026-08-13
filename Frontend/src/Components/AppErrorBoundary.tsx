import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ScreenLoop UI crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-screen-deep p-6 text-base-content">
        <section className="w-full max-w-md rounded-lg border border-screen-line bg-screen-surface p-6">
          <h1 className="text-2xl font-semibold text-slate-100">ScreenLoop hit a problem</h1>
          <p className="mt-2 text-sm text-screen-muted">
            Your recordings are still on disk. Reload the interface to reconnect and continue.
          </p>
          <button
            type="button"
            className="mt-5 h-10 rounded border border-primary bg-primary px-4 text-sm font-semibold text-primary-content"
            onClick={() => window.location.reload()}
          >
            Reload ScreenLoop
          </button>
        </section>
      </main>
    );
  }
}
