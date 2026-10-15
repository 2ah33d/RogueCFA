import { useState } from 'react';
import { saveKeys, saveProvider, saveYoutubeKey } from '../lib/storage';
import ProviderSelect from './ProviderSelect';

/**
 * KeySetup — Google Antigravity aesthetic: 16px radius, soft elevation shadow, soft blue pill CTA.
 */
export default function KeySetup({ onComplete, className = '' }) {
  const [finnhubKey, setFinnhubKey] = useState('');
  const [llmKey, setLlmKey] = useState('');
  const [alphaVantageKey, setAlphaVantageKey] = useState('');
  const [youtubeKey, setYoutubeKey] = useState('');
  const [provider, setProvider] = useState('claude');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!finnhubKey.trim()) {
      setError('Finnhub API key is required.');
      return;
    }
    if (!llmKey.trim()) {
      setError('LLM API key is required.');
      return;
    }
    saveKeys(finnhubKey, llmKey, alphaVantageKey);
    saveProvider(provider);
    saveYoutubeKey(youtubeKey);
    onComplete();
  };

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-fade-in ${className}`}>
      <div className="w-full max-w-md mx-4 bg-surface-card rounded-2xl p-6 md:p-8 shadow-antigravity-elevated animate-slide-up max-h-[90vh] overflow-y-auto font-sans">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="text-2xl font-bold tracking-tight text-prime">
              RogueFA
            </span>
          </div>
          <h1 className="text-lg font-bold text-prime mb-1">Welcome &amp; Key Setup</h1>
          <p className="text-dim text-xs leading-relaxed">
            Enter your API keys to get started. Keys are saved locally in browser storage only.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 font-sans">
          <div>
            <label htmlFor="key-finnhub" className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
              Finnhub API Key <span className="text-signal-avoid">*</span>
            </label>
            <input
              id="key-finnhub"
              type="password"
              value={finnhubKey}
              onChange={(e) => {
                setFinnhubKey(e.target.value);
                setError('');
              }}
              placeholder="Your Finnhub API key"
              className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-prime placeholder:text-dim/40 focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm font-sans shadow-inner border-transparent"
              autoComplete="off"
            />
            <a
              href="https://finnhub.io/register"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-accent hover:underline transition-colors mt-1.5 inline-block font-medium"
            >
              Get a free Finnhub key →
            </a>
          </div>

          <div>
            <label htmlFor="key-llm" className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
              LLM API Key ({provider}) <span className="text-signal-avoid">*</span>
            </label>
            <input
              id="key-llm"
              type="password"
              value={llmKey}
              onChange={(e) => {
                setLlmKey(e.target.value);
                setError('');
              }}
              placeholder="Your LLM API key"
              className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-prime placeholder:text-dim/40 focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm font-sans shadow-inner border-transparent"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="key-provider" className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
              LLM Provider
            </label>
            <ProviderSelect value={provider} onChange={setProvider} />
          </div>

          <div>
            <label htmlFor="key-youtube" className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
              YouTube Data API Key <span className="text-dim font-normal lowercase">(Optional — for Digest)</span>
            </label>
            <input
              id="key-youtube"
              type="password"
              value={youtubeKey}
              onChange={(e) => setYoutubeKey(e.target.value)}
              placeholder="Optional — enables MarketCall Digest"
              className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-prime placeholder:text-dim/40 focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm font-sans shadow-inner border-transparent"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="key-alpha" className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
              Alpha Vantage Key <span className="text-dim font-normal lowercase">(Optional)</span>
            </label>
            <input
              id="key-alpha"
              type="password"
              value={alphaVantageKey}
              onChange={(e) => setAlphaVantageKey(e.target.value)}
              placeholder="Optional — earnings &amp; fundamentals"
              className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-prime placeholder:text-dim/40 focus:outline-none focus:ring-1 focus:ring-accent/50 text-sm font-sans shadow-inner border-transparent"
              autoComplete="off"
            />
          </div>

          {error && <p className="text-xs text-signal-avoid font-medium">{error}</p>}

          <button
            type="submit"
            className="w-full py-3 bg-accent text-accent-text text-xs font-semibold rounded-full hover:bg-accent-hover transition-colors mt-3 shadow-antigravity"
          >
            Save Keys &amp; Continue
          </button>
        </form>
      </div>
    </div>
  );
}
