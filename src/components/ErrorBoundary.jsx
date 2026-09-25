import React from 'react';

/**
 * ErrorBoundary — Catches runtime JavaScript rendering exceptions in child trees
 * preventing the entire page from unmounting to a blank screen.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full max-w-2xl mx-auto my-8 p-6 bg-surface-card border border-rose-500/30 rounded-2xl text-center space-y-4 shadow-antigravity font-sans">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-xl text-rose-400">
            ⚠️
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-prime">
              {this.props.fallbackTitle || 'Something went wrong rendering this section'}
            </h3>
            <p className="text-xs text-dim max-w-md mx-auto leading-relaxed">
              An unexpected render error occurred. Your data is safe. Click below to reload this view.
            </p>
          </div>
          {this.state.error?.message && (
            <div className="bg-surface-elevated/60 border border-edge rounded-xl p-3 text-left max-w-lg mx-auto">
              <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider block mb-1">
                Diagnostic Trace
              </span>
              <p className="text-xs font-sans text-rose-200/90 break-words">
                {this.state.error.message}
              </p>
            </div>
          )}
          <div className="pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-5 py-2 bg-accent hover:bg-accent-hover text-accent-text text-xs font-semibold rounded-full transition-all cursor-pointer shadow-sm"
            >
              Reload Section
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
