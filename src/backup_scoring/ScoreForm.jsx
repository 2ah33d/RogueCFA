import { useState, useEffect } from 'react';
import { HOLD_PERIODS } from '../lib/promptBuilder';

/**
 * ScoreForm — Google Antigravity aesthetic: 16px (rounded-2xl) card, soft elevation shadow, rounded pill CTA.
 */
export default function ScoreForm({ onScore, loading, prefilledTicker = '', prefilledGuest = null, className = '' }) {
  const [tickers, setTickers] = useState('');
  const [holdPeriod, setHoldPeriod] = useState('6M');
  const [tsxOnly, setTsxOnly] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefilledTicker) {
      setTickers(prefilledTicker);
      setError('');
    }
  }, [prefilledTicker]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const parsed = tickers
      .toUpperCase()
      .split(/[,\s]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (tsxOnly && !t.includes('.') ? `${t}.TO` : t));

    if (parsed.length === 0) {
      setError('Enter at least one ticker symbol.');
      return;
    }
    if (parsed.length > 5) {
      setError('Maximum 5 tickers at a time.');
      return;
    }

    onScore([...new Set(parsed)], holdPeriod, prefilledGuest);
  };

  return (
    <form onSubmit={handleSubmit} className={`w-full max-w-3xl mx-auto ${className}`}>
      <div className="bg-surface-card rounded-2xl p-6 md:p-8 shadow-antigravity space-y-6">
        {/* Ticker input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              htmlFor="ticker-input"
              className="block text-xs font-semibold text-dim uppercase tracking-wider"
            >
              Ticker Symbol(s)
            </label>
            {prefilledGuest && (
              <span className="text-xs text-dim bg-surface-elevated px-3 py-1 rounded-full font-normal">
                BNN Pick: {prefilledGuest}
              </span>
            )}
          </div>
          <input
            id="ticker-input"
            type="text"
            value={tickers}
            onChange={(e) => {
              setTickers(e.target.value);
              setError('');
            }}
            placeholder="AAPL, MSFT, SHOP"
            disabled={loading}
            className="w-full px-4 py-3 bg-surface-elevated rounded-xl
                       text-prime text-base font-bold font-sans placeholder:font-normal placeholder:text-dim/35 placeholder:tracking-normal
                       focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all
                       disabled:opacity-50 tracking-wide shadow-inner"
            autoComplete="off"
            spellCheck="false"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
            <p className="text-xs text-dim">
              Enter up to 5 tickers separated by commas
            </p>
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs text-dim hover:text-prime transition-colors select-none">
              <input
                type="checkbox"
                checked={tsxOnly}
                onChange={(e) => setTsxOnly(e.target.checked)}
                disabled={loading}
                className="rounded bg-surface text-accent focus:ring-0 w-3.5 h-3.5 cursor-pointer"
              />
              <span>TSX-First (Auto-append <code className="text-prime font-sans">.TO</code>)</span>
            </label>
          </div>
        </div>

        {/* Hold period + submit */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label
              htmlFor="hold-period"
              className="block text-xs font-semibold text-dim uppercase tracking-wider mb-2"
            >
              Hold Period
            </label>
            <div className="relative">
              <select
                id="hold-period"
                value={holdPeriod}
                onChange={(e) => setHoldPeriod(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-3 bg-surface-elevated rounded-xl
                           text-prime appearance-none cursor-pointer
                           focus:outline-none focus:ring-1 focus:ring-accent/50 transition-colors disabled:opacity-50 font-sans text-sm shadow-inner"
              >
                {Object.entries(HOLD_PERIODS).map(([key, { label }]) => (
                  <option key={key} value={key} className="bg-surface-elevated text-prime">
                    {label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg
                  className="w-4 h-4 text-dim"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-8 py-3.5
                         bg-accent text-accent-text text-sm font-semibold rounded-full
                         hover:bg-accent-hover transition-all shadow-antigravity
                         disabled:opacity-50 disabled:cursor-not-allowed
                         flex items-center justify-center gap-2 min-w-[140px]"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Scoring…
                </>
              ) : (
                'Score It'
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs text-danger font-medium">{error}</p>
        )}
      </div>
    </form>
  );
}
