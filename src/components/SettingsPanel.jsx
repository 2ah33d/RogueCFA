import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  getKeys,
  getProvider,
  getYoutubeKey,
  getGroqKey,
  saveKeys,
  saveYoutubeKey,
  saveGroqKey,
  saveProvider,
  clearKeys,
  clearHistory,
} from '../lib/storage';
import ProviderSelect from './ProviderSelect';

function maskKey(key) {
  if (!key) return '—';
  if (key.length <= 8) return '••••••••';
  return '••••••••' + key.slice(-4);
}

export default function SettingsPanel({ onClose, onKeysCleared, className = '' }) {
  const storedKeys = getKeys();
  const storedYoutube = getYoutubeKey();
  const storedGroq = getGroqKey();
  const [finnhubKey, setFinnhubKey] = useState(storedKeys.finnhubKey);
  const [llmKey, setLlmKey] = useState(storedKeys.llmKey);
  const [alphaVantageKey, setAlphaVantageKey] = useState(storedKeys.alphaVantageKey);
  const [youtubeKey, setYoutubeKey] = useState(storedYoutube);
  const [groqKey, setGroqKey] = useState(storedGroq);

  const [provider, setProvider] = useState(getProvider());
  const [confirmClearKeys, setConfirmClearKeys] = useState(false);
  const [historyCleared, setHistoryCleared] = useState(false);
  const [keysClearedSuccess, setKeysClearedSuccess] = useState(false);
  const [isEditingKeys, setIsEditingKeys] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  /* Debug Mode */
  const debugMatch = typeof window !== 'undefined' ? window.location.search.match(/debug=([^&]+)/) : null;
  const debugSecret = debugMatch ? debugMatch[1] : null;
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState(null);

  const handleDebugRun = async () => {
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const adminToken = localStorage.getItem('roguefa_admin_token') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;

      const res = await fetch('/api/marketcall-process', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          youtubeKey,
          llmKey,
          provider,
          groqKey,
          debugSecret,
        }),
      });
      const data = await res.json();
      setDebugResult(data);
    } catch (err) {
      setDebugResult({ error: err.message });
    } finally {
      setDebugLoading(false);
    }
  };

  const handleProviderChange = (val) => {
    setProvider(val);
    saveProvider(val);
  };

  const handleSaveKeys = (e) => {
    if (e) e.preventDefault();
    saveKeys(finnhubKey, llmKey, alphaVantageKey);
    saveYoutubeKey(youtubeKey);
    saveGroqKey(groqKey);
    setIsEditingKeys(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleCancelEdit = () => {
    const current = getKeys();
    setFinnhubKey(current.finnhubKey);
    setLlmKey(current.llmKey);
    setAlphaVantageKey(current.alphaVantageKey);
    setYoutubeKey(getYoutubeKey());
    setGroqKey(getGroqKey());
    setIsEditingKeys(false);
  };

  const handleClearKeys = () => {
    if (!confirmClearKeys) {
      setConfirmClearKeys(true);
      return;
    }
    clearKeys();
    setFinnhubKey('');
    setLlmKey('');
    setAlphaVantageKey('');
    setYoutubeKey('');
    setGroqKey('');
    setConfirmClearKeys(false);
    setKeysClearedSuccess(true);
    setTimeout(() => setKeysClearedSuccess(false), 2500);
    if (onKeysCleared) {
      onKeysCleared();
    }
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistoryCleared(true);
    setTimeout(() => setHistoryCleared(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 15 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`fixed inset-0 z-50 bg-[#1E1F22] overflow-y-auto font-sans text-prime ${className}`}
    >
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-surface-card pb-6">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-surface-elevated hover:bg-surface-card text-dim hover:text-prime text-xs font-semibold rounded-full shadow-antigravity transition-all flex items-center gap-2"
              title="Return to application"
            >
              ← Back to App
            </button>
            <div>
              <h1 className="text-2xl font-bold text-prime tracking-tight">
                Settings &amp; Credentials
              </h1>
              <p className="text-xs text-dim mt-0.5">
                Manage your API keys, LLM providers, audio transcription, and browser data storage.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full text-dim hover:text-prime hover:bg-surface-elevated transition-colors text-base shadow-antigravity"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Settings Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Main API Keys Section (2 columns on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-surface-card rounded-2xl p-6 sm:p-8 shadow-antigravity space-y-6">
              <div className="flex items-center justify-between border-b border-surface-elevated/40 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-prime uppercase tracking-wider">
                    API Keys &amp; Service Credentials
                  </h3>
                  <p className="text-xs text-dim mt-0.5">
                    Keys are saved client-side in browser storage only.
                  </p>
                </div>
                {saveSuccess && (
                  <span className="text-xs font-semibold text-signal-buy bg-signal-buy/15 px-3 py-1 rounded-full animate-fade-in">
                    ✓ Keys Saved
                  </span>
                )}
                {!isEditingKeys && (
                  <button
                    type="button"
                    onClick={() => setIsEditingKeys(true)}
                    className="text-xs font-semibold text-accent-text bg-accent hover:bg-accent-hover px-4 py-1.5 rounded-full transition-colors shadow-antigravity"
                  >
                    Edit Credentials
                  </button>
                )}
              </div>

              {isEditingKeys ? (
                <form onSubmit={handleSaveKeys} className="space-y-4 animate-fade-in font-sans">
                  <div>
                    <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                      Finnhub API Key <span className="text-dim/70 font-normal normal-case ml-1">(Optional — leave blank for server key)</span>
                    </label>
                    <input
                      type="password"
                      value={finnhubKey}
                      onChange={(e) => setFinnhubKey(e.target.value)}
                      placeholder="Leave blank to use server key"
                      className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-sm text-prime font-sans placeholder:text-dim/50 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                      LLM API Key ({provider}) <span className="text-dim/70 font-normal normal-case ml-1">(Optional — leave blank for server key)</span>
                    </label>
                    <input
                      type="password"
                      value={llmKey}
                      onChange={(e) => setLlmKey(e.target.value)}
                      placeholder="Leave blank to use server key"
                      className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-sm text-prime font-sans placeholder:text-dim/50 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                      YouTube Data API Key <span className="text-dim/70 font-normal normal-case ml-1">(Optional — for Digest)</span>
                    </label>
                    <input
                      type="password"
                      value={youtubeKey}
                      onChange={(e) => setYoutubeKey(e.target.value)}
                      placeholder="Optional — leave blank for server key"
                      className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-sm text-prime font-sans placeholder:text-dim/50 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                      Groq Whisper API Key <span className="text-dim/70 font-normal normal-case ml-1">(Optional — Audio)</span>
                    </label>
                    <input
                      type="password"
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      placeholder="Optional — leave blank for server key"
                      className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-sm text-prime font-sans placeholder:text-dim/50 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 shadow-inner"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                      Alpha Vantage API Key <span className="text-dim/70 font-normal normal-case ml-1">(Optional — Fundamentals)</span>
                    </label>
                    <input
                      type="password"
                      value={alphaVantageKey}
                      onChange={(e) => setAlphaVantageKey(e.target.value)}
                      placeholder="Optional — leave blank for server key"
                      className="w-full px-4 py-3 bg-surface-elevated rounded-xl text-sm text-prime font-sans placeholder:text-dim/50 placeholder:font-sans focus:outline-none focus:ring-1 focus:ring-accent/50 shadow-inner"
                    />
                  </div>

                  <div className="flex items-center gap-3 pt-4">
                    <button
                      type="submit"
                      className="px-6 py-2.5 bg-accent text-accent-text text-xs font-semibold rounded-full hover:bg-accent-hover transition-colors shadow-antigravity"
                    >
                      Save Credentials
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="px-5 py-2.5 bg-surface-elevated text-dim hover:text-prime text-xs font-medium rounded-full transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="grid grid-cols-1 gap-3 font-sans">
                  <div className="bg-surface-elevated p-4 rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <div className="text-xs text-dim font-sans mb-0.5">Finnhub Market Data</div>
                      <div className="text-sm text-prime font-medium">
                        {finnhubKey ? <span className="font-sans">{maskKey(finnhubKey)}</span> : <span className="text-dim text-xs">Server Default (Environment Variable)</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-signal-buy bg-signal-buy/15 font-sans px-2.5 py-0.5 rounded-full">Active</span>
                  </div>

                  <div className="bg-surface-elevated p-4 rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <div className="text-xs text-dim font-sans mb-0.5">
                        LLM Engine ({provider})
                      </div>
                      <div className="text-sm text-prime font-medium">
                        {llmKey ? <span className="font-sans">{maskKey(llmKey)}</span> : <span className="text-dim text-xs">Server Default (Environment Variable)</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-signal-buy bg-signal-buy/15 font-sans px-2.5 py-0.5 rounded-full">Active</span>
                  </div>

                  <div className="bg-surface-elevated p-4 rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <div className="text-xs text-dim font-sans mb-0.5">YouTube Data API</div>
                      <div className="text-sm text-prime font-medium">
                        {youtubeKey ? <span className="font-sans">{maskKey(youtubeKey)}</span> : <span className="text-dim text-xs">Server Default (Environment Variable)</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-signal-buy bg-signal-buy/15 font-sans px-2.5 py-0.5 rounded-full">Active</span>
                  </div>

                  <div className="bg-surface-elevated p-4 rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <div className="text-xs text-dim font-sans mb-0.5">Groq Whisper (Audio)</div>
                      <div className="text-sm text-prime font-medium">
                        {groqKey ? <span className="font-sans">{maskKey(groqKey)}</span> : <span className="text-dim text-xs">Server Default (Environment Variable)</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-signal-buy bg-signal-buy/15 font-sans px-2.5 py-0.5 rounded-full">Active</span>
                  </div>

                  <div className="bg-surface-elevated p-4 rounded-xl flex items-center justify-between shadow-inner">
                    <div>
                      <div className="text-xs text-dim font-sans mb-0.5">Alpha Vantage (Fundamentals)</div>
                      <div className="text-sm text-prime font-bold">
                        {alphaVantageKey ? <span className="font-sans">{maskKey(alphaVantageKey)}</span> : <span className="text-dim text-xs font-normal">Server Default (Environment Variable)</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-signal-buy bg-signal-buy/15 font-sans px-2.5 py-0.5 rounded-full">Active</span>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Provider & Data Management */}
          <div className="space-y-6">
            {/* Provider Card */}
            <section className="bg-surface-card rounded-2xl p-6 shadow-antigravity space-y-4">
              <h3 className="text-xs font-semibold text-dim uppercase tracking-wider">
                LLM Intelligence Provider
              </h3>
              <p className="text-xs text-dim leading-relaxed">
                Select your preferred model provider for stock thesis evaluation and comparative matrices.
              </p>
              <ProviderSelect value={provider} onChange={handleProviderChange} />
            </section>

            {/* Storage Data Controls */}
            <section className="bg-surface-card rounded-2xl p-6 shadow-antigravity space-y-4">
              <h3 className="text-xs font-semibold text-dim uppercase tracking-wider">
                Local Data Management
              </h3>

              <div className="space-y-3">
                <button
                  onClick={handleClearHistory}
                  className="w-full py-2.5 px-4 bg-surface-elevated rounded-full
                             text-dim hover:text-prime transition-colors text-xs font-medium shadow-antigravity text-center"
                >
                  {historyCleared ? '✓ History Cleared' : 'Clear Saved Score History'}
                </button>

                <button
                  onClick={handleClearKeys}
                  className={`w-full py-2.5 px-4 rounded-full text-xs font-semibold transition-colors text-center shadow-antigravity ${
                    confirmClearKeys
                      ? 'bg-danger/20 text-danger'
                      : 'bg-surface-elevated text-dim hover:text-danger'
                  }`}
                >
                  {keysClearedSuccess
                    ? '✓ Custom Keys Cleared'
                    : confirmClearKeys
                    ? 'Confirm Clear Custom API Keys'
                    : 'Clear Custom API Keys'}
                </button>
              </div>
            </section>

            {/* Debug Mode section if active */}
            {debugSecret && (
              <section className="bg-surface-card rounded-2xl p-6 shadow-antigravity space-y-3">
                <span className="text-[10px] font-semibold tracking-wider text-accent uppercase block">
                  Debug Mode Active
                </span>
                <button
                  onClick={handleDebugRun}
                  disabled={debugLoading}
                  className="w-full py-2.5 bg-surface-elevated text-accent rounded-full text-xs font-semibold hover:bg-surface transition-colors disabled:opacity-50 shadow-antigravity"
                >
                  {debugLoading ? 'Running Pipeline...' : 'Force Regenerate Pipeline'}
                </button>
                {debugResult && (
                  <pre className="text-[10px] bg-surface-elevated p-3 rounded-xl text-dim overflow-x-auto max-h-48 font-sans shadow-inner">
                    {JSON.stringify(debugResult, null, 2)}
                  </pre>
                )}
              </section>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center pt-4 pb-8 border-t border-surface-card">
          <p className="text-xs text-dim">
            RogueFA is client-side BYOK (Bring Your Own Key). Your credentials never touch external databases.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
