import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  hasKeys as checkHasKeys,
  getKeys,
  getProvider,
} from './lib/storage';
import { fetchTickerData } from './lib/finnhub';
import { fetchAlphaVantageData } from './lib/alphavantage';
import { calculateScore } from './lib/calculateScore';
import { buildPrompt, buildComparisonPrompt } from './lib/promptBuilder';
import { scoreWithLLM } from './lib/scorer';
import { resolveOutcomes, saveScoreToHistory } from './lib/historyManager';
import KeySetup from './components/KeySetup';
import ScoreForm from './components/ScoreForm';
import ScorecardGrid from './components/ScorecardGrid';
import Disclaimer from './components/Disclaimer';
import SettingsPanel from './components/SettingsPanel';
import HistoryTab from './components/HistoryTab';
import ComparisonMatrix from './components/ComparisonMatrix';
import MarketCallBar from './components/MarketCallBar';
import GuestModal from './components/GuestModal';
import TickerSearch from './components/TickerSearch';
import DigestView from './components/DigestView';
import LandingPage from './components/LandingPage';
import NavPill from './components/NavPill';
import { Menu, X, LayoutDashboard, Search, Sparkles, History } from 'lucide-react';

/* ── Google Antigravity System Tokens ── */
const THEME = `
:root {
  /* ——— Surfaces (Google Antigravity Soft Charcoal & Slate) ——— */
  --c-surface:          30 31 34;      /* #1E1F22 — Base background (faint warmth) */
  --c-surface-card:     42 44 49;      /* #2A2C31 — Card / panel surface */
  --c-surface-elevated: 48 50 57;      /* #303239 — Elevated surface (dropdowns, modals) */

  /* ——— Borders (Minimal to none — depth comes from soft elevation shadows) ——— */
  --c-edge:             255 255 255 / 0.04;

  /* ——— Text ——— */
  --c-prime:            227 227 227;   /* #E3E3E3 — Soft off-white primary text */
  --c-dim:              154 160 166;   /* #9AA0A6 — Soft muted grey secondary text */
  --c-faint:            110 115 122 / 0.5;  /* #6E737B — Soft dimmed placeholder text */

  /* ——— Accent Theme — Exact Logo Ocean/Steel Blue (#1A6A9B) & Soft Google Blue (#8AB4F8) ——— */
  /* [EXACT LOGO COLOR]: Ocean/Steel Blue (#1A6A9B) with crisp white text */
  --c-accent:           26 106 155;    /* #1A6A9B — Exact Logo Ocean/Steel Blue */
  --c-accent-hover:     31 122 178;    /* #1F7AB2 — Ocean Blue Hover */
  --c-accent-muted:     26 106 155 / 0.18;
  --c-accent-text:      255 255 255;   /* #FFFFFF — Crisp White Button Text */

  /* [TO REVERT BACK TO SOFT GOOGLE BLUE]: Uncomment lines below & comment out above:
  --c-accent:           138 180 248;   / * #8AB4F8 * /
  --c-accent-hover:     168 199 250;   / * #A8C7FA * /
  --c-accent-muted:     138 180 248 / 0.15;
  --c-accent-text:      30 31 34;      / * #1E1F22 * /
  */

  /* ——— Functional Status Colours (Antigravity Soft Tint Pattern) ——— */
  --c-signal-buy:       129 201 149;   /* #81C995 — Soft muted green */
  --c-signal-watch:     253 226 147;   /* #FDE293 — Soft muted yellow */
  --c-signal-avoid:     242 139 130;   /* #F28B82 — Soft muted red */

  /* ——— Danger ——— */
  --c-danger:           242 139 130;   /* #F28B82 */
}
`;

export default function App() {
  /* ── State ── */
  const [keysReady, setKeysReady] = useState(checkHasKeys);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState('landing');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const MOBILE_TABS = [
    { key: 'landing', label: 'Overview', icon: LayoutDashboard },
    { key: 'search', label: 'Ticker Search', icon: Search },
    { key: 'digest', label: 'Latest Picks', icon: Sparkles },
    { key: 'history', label: 'Score History', icon: History },
  ];

  const [loading, setLoading] = useState(false);
  const [loadingTickers, setLoadingTickers] = useState([]);
  const [scorecards, setScorecards] = useState([]);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [currentHoldPeriod, setCurrentHoldPeriod] = useState('6M');
  const [toasts, setToasts] = useState([]);

  /* Prefilled inputs from BNN picks strip */
  const [prefilledTicker, setPrefilledTicker] = useState('');
  const [prefilledGuest, setPrefilledGuest] = useState(null);

  /* Modal for guest analyst track record */
  const [selectedGuest, setSelectedGuest] = useState(null);

  /* Resolve pending history outcomes on mount */
  useEffect(() => {
    resolveOutcomes().catch(() => {});
  }, []);

  /* Toast notification helper */
  const addToast = useCallback((message, type = 'error') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 6000);
  }, []);

  /* Check keys on mount / when drawer closes */
  const refreshKeyStatus = useCallback(() => {
    setKeysReady(checkHasKeys());
  }, []);

  /* ── Scoring Pipeline: Intercept search submission before any AI usage ── */
  const handleScore = useCallback(
    async () => {
      addToast("sorry, we're still working on this part of the website", 'info');
    },
    [addToast]
  );

  /* ── Key management ── */
  const handleKeysCleared = useCallback(() => {
    setScorecards([]);
  }, []);

  /* ── Render ── */
  return (
    <>
      <style>{THEME}</style>

      <div className="min-h-screen bg-surface flex flex-col font-sans selection:bg-accent/20">
        {/* ── Sticky Top Bar ── */}
        <header className="sticky top-0 z-40 bg-surface/85 backdrop-blur-xl border-b border-surface-card/60 shadow-sm transition-all">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
            {/* Logo & Live Commit SHA */}
            <div className="flex items-center gap-3">
              <div
                className="flex items-center gap-2.5 cursor-pointer select-none group"
                onClick={() => {
                  setActiveTab('landing');
                  setMobileMenuOpen(false);
                }}
              >
                <img
                  src="/logo.png"
                  alt="RogueCFA Logo"
                  className="w-8 h-8 object-contain rounded-lg group-hover:scale-105 transition-transform duration-300"
                />
                <span className="text-lg font-bold tracking-tight text-prime">
                  RogueCFA
                </span>
              </div>
              <a
                href={`https://github.com/2ah33d/RogueCFA.ai/commit/${typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev'}`}
                target="_blank"
                rel="noreferrer"
                title="Active Deployed Commit SHA (Click to view on GitHub)"
                className="hidden sm:flex px-2 py-0.5 rounded-full text-[10px] font-sans tracking-wider bg-surface-card/80 border border-white/10 text-dim hover:text-prime hover:border-accent/40 transition-all items-center gap-1.5 select-none"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-signal-buy animate-pulse" />
                <span>v{typeof __COMMIT_SHA__ !== 'undefined' ? __COMMIT_SHA__ : 'dev'}</span>
              </a>
            </div>

            {/* Desktop Nav Pill (hidden on mobile < md) */}
            <div className="hidden md:block">
              <NavPill activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 flex items-center justify-center rounded-full
                           text-dim hover:text-prime hover:bg-surface-card
                           transition-all shadow-antigravity"
                aria-label="Open settings"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55
                       0 1.02.398 1.11.94l.213 1.281c.063.374.313.686
                       .645.87.074.04.147.083.22.127.324.196.72.257
                       1.075.124l1.217-.456a1.125 1.125 0
                       011.37.49l1.296 2.247a1.125 1.125 0
                       01-.26 1.431l-1.003.827c-.293.24-.438.613
                       -.431.992a6.759 6.759 0 010
                       .255c-.007.378.138.75.43.99l1.005.828c.424.35
                       .534.954.26 1.43l-1.298 2.247a1.125 1.125 0
                       01-1.369.491l-1.217-.456c-.355-.133-.75-.072
                       -1.076.124a6.57 6.57 0
                       01-.22.128c-.331.183-.581.495-.644.869l-.213
                       1.28c-.09.543-.56.941-1.11.941h-2.594c-.55
                       0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374
                       -.312-.686-.644-.87a6.52 6.52 0
                       01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217
                       .456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125
                       1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613
                       .43-.992a6.932 6.932 0 010-.255c.007-.378-.138
                       -.75-.43-.99l-1.004-.828a1.125 1.125 0
                       01-.26-1.43l1.297-2.247a1.125 1.125 0
                       011.37-.491l1.216.456c.356.133.751.072
                       1.076-.124.072-.044.146-.087.22-.128.332-.183
                       .582-.495.644-.869l.214-1.281z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>

              {/* Mobile Hamburger Toggle Button (visible on < md) */}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-dim hover:text-prime bg-surface-card/60 hover:bg-surface-card border border-white/5 transition-all md:hidden select-none"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5 text-prime" />
                ) : (
                  <Menu className="w-5 h-5 text-prime" />
                )}
              </button>
            </div>
          </div>

          {/* Animated Mobile Hamburger Menu Drawer */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="md:hidden border-t border-surface-card/60 bg-surface-card/95 backdrop-blur-xl overflow-hidden shadow-2xl"
              >
                <nav className="p-3 space-y-1 font-sans">
                  {MOBILE_TABS.map((tab) => {
                    const isActive = activeTab === tab.key;
                    const IconComp = tab.icon;
                    return (
                      <button
                        key={tab.key}
                        type="button"
                        onClick={() => {
                          setActiveTab(tab.key);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all select-none ${
                          isActive
                            ? 'bg-accent text-accent-text font-semibold shadow-md shadow-accent/20'
                            : 'text-dim hover:text-prime hover:bg-surface-elevated/50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComp className={`w-4 h-4 ${isActive ? 'text-accent-text' : 'text-dim'}`} />
                          <span>{tab.label}</span>
                        </div>
                        {isActive && (
                          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        )}
                      </button>
                    );
                  })}
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* ── Main content ── */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col items-center gap-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="w-full flex flex-col items-center gap-6"
            >
              {activeTab === 'landing' ? (
                <LandingPage
                  onLaunchTool={(tab = 'search') => setActiveTab(tab)}
                  onSelectTicker={(ticker, guest) => {
                    setPrefilledTicker(ticker);
                    setPrefilledGuest(guest);
                    setActiveTab('search');
                  }}
                  onSelectGuest={(guest) => setSelectedGuest(guest)}
                />
              ) : activeTab === 'score' || activeTab === 'search' ? (
                <TickerSearch
                  prefilledTicker={prefilledTicker}
                  onSelectGuest={(guest) => setSelectedGuest(guest)}
                />
              ) : activeTab === 'digest' ? (
                <DigestView
                  onScoreTicker={(ticker, guest) => {
                    setPrefilledTicker(ticker);
                    setPrefilledGuest(guest);
                    setActiveTab('search');
                  }}
                  onSelectGuest={(guest) => setSelectedGuest(guest)}
                  onOpenSettings={() => setShowSettings(true)}
                />
              ) : (
                <HistoryTab
                  onSelectTicker={(ticker) => {
                    setPrefilledTicker(ticker);
                    setActiveTab('search');
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* ── Footer ── */}
        <Disclaimer />

        {/* ── Settings Drawer ── */}
        <AnimatePresence>
          {showSettings && (
            <SettingsPanel
              onClose={() => {
                setShowSettings(false);
                refreshKeyStatus();
              }}
              onKeysCleared={handleKeysCleared}
            />
          )}
        </AnimatePresence>

        {/* ── Guest Analyst Modal ── */}
        <AnimatePresence>
          {selectedGuest && (
            <GuestModal
              guestName={selectedGuest}
              onClose={() => setSelectedGuest(null)}
              onSelectTicker={(ticker, guest) => {
                setPrefilledTicker(ticker);
                if (guest) setPrefilledGuest(guest);
                setActiveTab('score');
              }}
            />
          )}
        </AnimatePresence>

        {/* ── Toast Notifications ── */}
        {toasts.length > 0 && (
          <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full animate-fade-in font-sans">
            {toasts.map((t) => (
              <div
                key={t.id}
                className="px-4 py-3 bg-surface-elevated rounded-2xl text-xs text-prime shadow-antigravity-elevated flex items-center justify-between gap-3 border-0"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-signal-avoid shrink-0" />
                  <span className="text-prime font-medium leading-snug">{t.message || t.msg}</span>
                </div>
                <button
                  onClick={() =>
                    setToasts((prev) => prev.filter((item) => item.id !== t.id))
                  }
                  className="text-dim hover:text-prime text-sm leading-none p-1 rounded-full hover:bg-surface-card transition-colors shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
