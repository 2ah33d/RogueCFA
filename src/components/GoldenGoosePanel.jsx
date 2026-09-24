import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { buildShortlists } from '../lib/goldenGoose';
import { getKeys, getProvider } from '../lib/storage';

/**
 * AnalystMentionPill — Subtle grey collapsible commentary pill
 * Low-contrast, clean, understated styling to avoid visual noise.
 * Expands on click to reveal full broadcast quote.
 */
function AnalystMentionPill({ mention, onSelectGuest }) {
  const [isOpen, setIsOpen] = useState(false);

  const formattedDate = useMemo(() => {
    if (!mention.date || mention.date === 'Recent') return 'Recent';
    try {
      const [y, m, d] = mention.date.split('-');
      if (y && m && d) {
        const dateObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
        return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      return mention.date;
    } catch {
      return mention.date;
    }
  }, [mention.date]);

  const isPick = mention.mentionType === 'pick';
  const stance = mention.stance?.toLowerCase();

  return (
    <div className="bg-surface-elevated/25 hover:bg-surface-elevated/50 border border-white/[0.04] hover:border-white/[0.08] rounded-xl overflow-hidden transition-all">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left cursor-pointer select-none group"
      >
        <div className="flex items-center gap-2 min-w-0 pr-1 text-xs text-dim group-hover:text-prime/90 transition-colors">
          <svg
            className={`w-3 h-3 text-dim/60 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90 text-amber-400/80' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="truncate text-[11px]">
            Mentioned on <span className="text-dim/80">{formattedDate}</span> by <span className="text-dim/95 font-medium">{mention.guest}</span>
          </span>
        </div>

        {/* Subtle Stance Badge */}
        <div className="shrink-0 flex items-center">
          {isPick ? (
            <span className="px-2 py-0.5 text-[9px] font-semibold uppercase rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/90">
              BUY (TOP PICK)
            </span>
          ) : stance === 'buy' ? (
            <span className="px-2 py-0.5 text-[9px] font-semibold uppercase rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400/80">
              BUY
            </span>
          ) : stance === 'hold' ? (
            <span className="px-2 py-0.5 text-[9px] font-semibold uppercase rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300/80">
              HOLD
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[9px] font-semibold uppercase rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400/80">
              SELL
            </span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 py-2.5 border-t border-white/[0.04] bg-surface/50 text-[11px] text-dim leading-relaxed space-y-2">
              <p className="italic text-dim/90">"{mention.reasoning}"</p>
              {onSelectGuest && mention.guest && mention.guest !== 'Guest Analyst' && mention.guest !== 'MarketCall Analyst' && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectGuest(mention.guest);
                    }}
                    className="text-[10px] text-dim/70 hover:text-amber-400 font-normal transition-colors inline-flex items-center gap-1"
                  >
                    <span>View {mention.guest}'s Track Record</span>
                    <span>→</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * GoldenGoosePanel — Golden Goose v2 UI Component
 * Renders multi-analyst conviction picks & warning sells with subtle grey
 * collapsible commentary bubbles and fixed AI conviction summaries.
 *
 * @param {Object} props
 * @param {Array<Object>} props.episodes - List of MarketCall episodes
 * @param {Function} props.onSelectGuest - (guestName) => void — open guest profile
 */
export default function GoldenGoosePanel({ episodes = [], onSelectGuest, onRefreshEpisodes }) {
  const [showAllShortlists, setShowAllShortlists] = useState(false);
  const [llmResult, setLlmResult] = useState(null);
  const [loadingLLM, setLoadingLLM] = useState(false);
  const [isAiCurated, setIsAiCurated] = useState(false);

  /* Layer 1: Deterministic Shortlists */
  const { buyHoldCandidates, sellCandidates } = useMemo(() => {
    return buildShortlists(episodes, 7);
  }, [episodes]);

  /* Check for pre-existing Supabase goldenGoose analysis in episode data */
  useEffect(() => {
    if (buyHoldCandidates.length === 0 && sellCandidates.length === 0) {
      setLlmResult({ goldenPicks: [], warningSells: [], _rejectedTickers: [] });
      setIsAiCurated(false);
      return;
    }

    const latestEp = episodes[0];
    const savedGoose =
      latestEp?.digest?.goldenGoose ||
      latestEp?.result?.goldenGoose ||
      latestEp?.goldenGoose;

    if (savedGoose && Array.isArray(savedGoose.goldenPicks) && savedGoose.goldenPicks.length > 0) {
      setLlmResult(savedGoose);
      setIsAiCurated(true);
    } else {
      /* Candidate fallback: present deterministic shortlist candidates directly */
      setLlmResult({
        goldenPicks: buyHoldCandidates.map((c) => ({
          ticker: c.ticker,
          rationale: `Surfaced from multi-analyst shortlist (${c.mentionCount} mentions across ${c.distinctGuestCount} distinct analysts with +${c.weightedScore} score).`,
        })),
        warningSells: sellCandidates.map((c) => ({
          ticker: c.ticker,
          rationale: `Surfaced from sell candidate shortlist (${c.mentionCount} sell mention, score ${c.weightedScore}).`,
        })),
        _rejectedTickers: [],
      });
      setIsAiCurated(false);
    }
  }, [episodes, buyHoldCandidates, sellCandidates]);

  /* Explicit Trigger: Generate / Refresh LLM Eyes on demand */
  const handleGenerateLLMEyes = useCallback(async (force = true) => {
    setLoadingLLM(true);
    if (onRefreshEpisodes) {
      onRefreshEpisodes();
    }
    const { llmKey } = getKeys();
    const provider = getProvider();

    try {
      const res = await fetch('/api/goldengoose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          windowDays: 7,
          llmKey,
          provider,
          force,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data && data.result) {
          const hasPicks = (data.result.goldenPicks || []).length > 0 || (data.result.warningSells || []).length > 0;
          if (hasPicks) {
            setLlmResult(data.result);
            setIsAiCurated(true);
          } else {
            /* If AI filtered to 0, still preserve candidate shortlists so user sees actionable data */
            setLlmResult({
              goldenPicks: buyHoldCandidates.map((c) => ({
                ticker: c.ticker,
                rationale: `Candidate shortlist with +${c.weightedScore} score (${c.mentionCount} mentions across ${c.distinctGuestCount} analysts).`,
              })),
              warningSells: sellCandidates.map((c) => ({
                ticker: c.ticker,
                rationale: `Candidate warning shortlist with score ${c.weightedScore}.`,
              })),
              _rejectedTickers: data.result._rejectedTickers || [],
            });
            setIsAiCurated(false);
          }
        }
      }
    } catch (err) {
      console.warn('[GoldenGoosePanel] Failed to generate LLM eyes:', err);
    } finally {
      setLoadingLLM(false);
    }
  }, [buyHoldCandidates, sellCandidates]);

  if (!episodes || episodes.length === 0) {
    return (
      <div className="bg-surface-card border border-edge/60 rounded-2xl p-6 text-center shadow-antigravity my-6">
        <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">
          🪿
        </div>
        <h3 className="text-base font-bold text-prime mb-1">Golden Goose Signals Pending</h3>
        <p className="text-xs text-dim max-w-md mx-auto">
          Load recent BNN MarketCall episode digests from history to build deterministic shortlists and run conviction evaluation.
        </p>
      </div>
    );
  }

  /* Extract effective picks (either AI curated or shortlist fallback) */
  let goldenPicks = llmResult?.goldenPicks || [];
  let warningSells = llmResult?.warningSells || [];

  if (goldenPicks.length === 0 && buyHoldCandidates.length > 0) {
    goldenPicks = buyHoldCandidates.map((c) => ({
      ticker: c.ticker,
      rationale: `Multi-analyst convergence candidate (+${c.weightedScore} score, ${c.mentionCount} mentions across ${c.distinctGuestCount} analysts).`,
    }));
  }

  if (warningSells.length === 0 && sellCandidates.length > 0) {
    warningSells = sellCandidates.map((c) => ({
      ticker: c.ticker,
      rationale: `Candidate warning sell (${c.mentionCount} analyst sell mention).`,
    }));
  }

  /* Create quick lookup map for candidate details, merging API shortlists with local candidates */
  const candidateMap = useMemo(() => {
    const map = new Map();
    const all = [
      ...(llmResult?.shortlists?.buyHoldCandidates || []),
      ...(llmResult?.shortlists?.sellCandidates || []),
      ...buyHoldCandidates,
      ...sellCandidates,
    ];
    all.forEach((cand) => {
      const existing = map.get(cand.ticker);
      if (!existing || (cand.mentions && cand.mentions.length > (existing.mentions?.length || 0))) {
        map.set(cand.ticker, cand);
      }
    });
    return map;
  }, [llmResult, buyHoldCandidates, sellCandidates]);

  return (
    <div className="w-full max-w-4xl mx-auto my-8 space-y-6 font-sans">
      {/* ── Header Bar ── */}
      <div className="bg-gradient-to-r from-amber-950/30 via-surface-card to-surface-card border border-amber-500/25 rounded-2xl p-6 shadow-antigravity relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🪿</span>
              <h2 className="text-lg font-bold text-prime tracking-tight">Golden Goose Radar</h2>
              <span className="px-2.5 py-0.5 text-[10px] font-sans font-semibold uppercase bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-full">
                {isAiCurated ? 'AI Conviction Curated' : '7-Day Multi-Analyst Convergence'}
              </span>
            </div>
            <p className="text-xs text-dim">
              Layer 1 deterministic shortlist ({buyHoldCandidates.length} buy/hold, {sellCandidates.length} sell) → Layer 2 AI conviction synthesis.
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-sans">
            <button
              type="button"
              onClick={() => handleGenerateLLMEyes(true)}
              disabled={loadingLLM}
              className="px-3.5 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold disabled:opacity-50 shadow-sm cursor-pointer"
              title="Evaluate and synthesize candidate shortlists with AI"
            >
              {loadingLLM ? (
                <svg className="w-3.5 h-3.5 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <span>✨</span>
              )}
              <span>{loadingLLM ? 'Evaluating...' : 'Refresh AI Conviction'}</span>
            </button>

            <div className="px-3 py-1.5 bg-surface-elevated/60 border border-edge rounded-xl text-dim flex items-center gap-2">
              <span className="text-amber-400 font-bold">+{goldenPicks.length}</span>
              <span>Golden Pick{goldenPicks.length === 1 ? '' : 's'}</span>
            </div>
            {warningSells.length > 0 && (
              <div className="px-3 py-1.5 bg-rose-950/30 border border-rose-500/30 rounded-xl text-rose-400">
                <span className="font-bold mr-1.5">{warningSells.length}</span>
                <span>Warning Sell{warningSells.length === 1 ? '' : 's'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Diagnostic Tracker: Rejected Off-List Tickers */}
        {rejectedTickers.length > 0 && (
          <div className="mt-3 bg-rose-950/25 border border-rose-500/25 rounded-xl p-2.5 text-[11px] text-rose-300 flex items-center gap-2">
            <span className="font-bold">⚠️ LLM Hallucination Guard:</span>
            <span>Rejected off-list ticker(s): {rejectedTickers.join(', ')}</span>
          </div>
        )}
      </div>

      {/* ── Golden Picks Section ── */}
      {goldenPicks.length > 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400/90 flex items-center gap-2">
              <span>🏆 {isAiCurated ? 'AI-Curated Golden Picks' : 'Multi-Analyst Shortlist Picks'}</span>
              <span className="text-xs font-normal text-dim uppercase">({goldenPicks.length} Tickers)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {goldenPicks.map((pick) => {
              const cand = candidateMap.get(pick.ticker);
              const company = cand?.company || pick.ticker;

              return (
                <div
                  key={pick.ticker}
                  className="bg-surface-card border border-amber-500/30 hover:border-amber-400/60 rounded-2xl p-5 shadow-lg shadow-amber-950/10 transition-all group relative flex flex-col justify-between"
                >
                  <div className="space-y-3.5">
                    {/* Card Header: Ticker & Candidate Stats */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-extrabold text-prime group-hover:text-amber-400 transition-colors">
                            {pick.ticker}
                          </span>
                          <span className="px-2 py-0.5 text-[9px] font-sans font-bold bg-amber-400/15 border border-amber-400/35 text-amber-300 rounded-md">
                            {isAiCurated ? 'AI CONVICTION' : 'SHORTLIST CANDIDATE'}
                          </span>
                        </div>
                        <p className="text-xs text-dim line-clamp-1">{company}</p>
                      </div>

                      {cand && (
                        <div className="text-right">
                          <div className="text-base font-black text-amber-400">
                            +{cand.weightedScore} <span className="text-[10px] text-dim/60 font-normal">SCORE</span>
                          </div>
                          <div className="text-[10px] text-dim/80 font-sans">
                            {cand.mentionCount} mention(s) · {cand.distinctGuestCount} guest(s)
                          </div>
                        </div>
                      )}
                    </div>

                    {/* AI Conviction Rationale (Fixed & Prominent) */}
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-xs text-amber-200/90 leading-relaxed shadow-sm">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-1">
                        <span>✨ Conviction Rationale</span>
                      </div>
                      <p>{pick.rationale}</p>
                    </div>

                    {/* Collapsible Analyst Commentary Pills (Subtle Grey) */}
                    {cand?.mentions && cand.mentions.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between text-[10px] font-medium text-dim/60 uppercase tracking-wider px-0.5">
                          <span>Analyst Mentions ({cand.mentions.length})</span>
                          <span className="text-[10px] font-normal text-dim/40 lowercase">click to expand</span>
                        </div>
                        <div className="space-y-1">
                          {cand.mentions.map((m, idx) => (
                            <AnalystMentionPill
                              key={idx}
                              mention={m}
                              onSelectGuest={onSelectGuest}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-surface-card border border-edge rounded-xl p-6 text-center text-xs text-dim space-y-2">
          {loadingLLM ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin text-amber-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              <span>Evaluating candidate shortlists with AI...</span>
            </div>
          ) : (
            <div>
              <p className="text-prime font-semibold mb-1">No Multi-Analyst Convergence in Current Window</p>
              <p className="text-dim">Generate new MarketCall digests from the Latest Picks tab to discover converging multi-analyst ideas.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Warning Sells Section ── */}
      {warningSells.length > 0 && (
        <div className="space-y-3 pt-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-rose-400/90 flex items-center gap-2">
            <span>⚠️ Multi-Analyst Warning Sells</span>
            <span className="text-xs font-normal text-dim">({warningSells.length})</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {warningSells.map((sell) => {
              const cand = candidateMap.get(sell.ticker);

              return (
                <div
                  key={sell.ticker}
                  className="bg-rose-950/15 border border-rose-500/30 rounded-2xl p-5 shadow-lg shadow-rose-950/10 flex flex-col justify-between"
                >
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-extrabold text-rose-300">{sell.ticker}</span>
                          <span className="px-2 py-0.5 text-[9px] font-sans font-bold bg-rose-500/15 border border-rose-500/30 text-rose-300 rounded-md">
                            WARNING SELL
                          </span>
                        </div>
                        <p className="text-xs text-dim line-clamp-1">{cand?.company || sell.ticker}</p>
                      </div>
                      {cand && (
                        <span className="text-xs font-bold text-rose-400">{cand.weightedScore} SCORE</span>
                      )}
                    </div>

                    {/* Fixed AI Warning Summary */}
                    <div className="bg-rose-950/30 border border-rose-500/25 rounded-xl p-3 text-xs text-rose-200/90 leading-relaxed">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                        <span>⚠️ Risk Summary</span>
                      </div>
                      <p>{sell.rationale}</p>
                    </div>

                    {/* Collapsible Analyst Commentary Pills for Warning Sells */}
                    {cand?.mentions && cand.mentions.length > 0 && (
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex items-center justify-between text-[10px] font-medium text-dim/60 uppercase tracking-wider px-0.5">
                          <span>Analyst Mentions ({cand.mentions.length})</span>
                          <span className="text-[10px] font-normal text-dim/40 lowercase">click to expand</span>
                        </div>
                        <div className="space-y-1">
                          {cand.mentions.map((m, idx) => (
                            <AnalystMentionPill
                              key={idx}
                              mention={m}
                              onSelectGuest={onSelectGuest}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Shortlist Candidates Drawer Toggle ── */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setShowAllShortlists(!showAllShortlists)}
          className="w-full py-2.5 px-4 bg-surface-card hover:bg-surface-elevated border border-edge text-dim hover:text-prime text-xs font-medium rounded-xl transition-all flex items-center justify-between cursor-pointer"
        >
          <span>View Layer 1 Deterministic Shortlist Candidates ({buyHoldCandidates.length + sellCandidates.length})</span>
          <svg
            className={`w-4 h-4 transition-transform ${showAllShortlists ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showAllShortlists && (
          <div className="mt-3 bg-surface-card border border-edge rounded-2xl overflow-hidden shadow-inner space-y-4 p-4">
            <div>
              <h4 className="text-xs font-semibold uppercase text-amber-400 mb-2">Buy/Hold Candidates (Min 2 Mentions)</h4>
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-elevated border-b border-edge text-dim uppercase text-[10px]">
                  <tr>
                    <th className="py-2 px-3">Ticker</th>
                    <th className="py-2 px-3">Company</th>
                    <th className="py-2 px-3 text-center">Score</th>
                    <th className="py-2 px-3 text-center">Mentions</th>
                    <th className="py-2 px-3 text-center">Analysts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge/40">
                  {buyHoldCandidates.map((cand) => (
                    <tr key={cand.ticker} className="hover:bg-surface-elevated/40">
                      <td className="py-2 px-3 font-bold text-prime">{cand.ticker}</td>
                      <td className="py-2 px-3 text-dim truncate max-w-[160px]">{cand.company}</td>
                      <td className="py-2 px-3 text-center font-bold text-amber-400">+{cand.weightedScore}</td>
                      <td className="py-2 px-3 text-center text-dim">{cand.mentionCount}</td>
                      <td className="py-2 px-3 text-center text-dim">{cand.distinctGuestCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sellCandidates.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase text-rose-400 mb-2">Sell Candidates (Unfiltered)</h4>
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-elevated border-b border-edge text-dim uppercase text-[10px]">
                    <tr>
                      <th className="py-2 px-3">Ticker</th>
                      <th className="py-2 px-3">Company</th>
                      <th className="py-2 px-3 text-center">Score</th>
                      <th className="py-2 px-3 text-center">Mentions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge/40">
                    {sellCandidates.map((cand) => (
                      <tr key={cand.ticker} className="hover:bg-surface-elevated/40">
                        <td className="py-2 px-3 font-bold text-rose-300">{cand.ticker}</td>
                        <td className="py-2 px-3 text-dim truncate max-w-[160px]">{cand.company}</td>
                        <td className="py-2 px-3 text-center font-bold text-rose-400">{cand.weightedScore}</td>
                        <td className="py-2 px-3 text-center text-dim">{cand.mentionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
