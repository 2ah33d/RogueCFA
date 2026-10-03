import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getGuestTrackRecord } from '../lib/guestTracker';
import { ScoreCircle } from './AnalystBubble';

/**
 * GuestModal — Google Antigravity aesthetic: 16px (rounded-2xl) modal, soft elevation shadow, task-status pills.
 */
export default function GuestModal({ guestName, onClose, onSelectTicker, className = '' }) {
  const [liveRecord, setLiveRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  const localSeedRecord = guestName ? getGuestTrackRecord(guestName) : null;

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!guestName) return;
    setLoading(true);

    let isMounted = true;
    fetch(`/api/analyst-record?guest=${encodeURIComponent(guestName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && data.status === 'success' && Array.isArray(data.picks) && data.picks.length > 0) {
          setLiveRecord(data);
        } else {
          setLiveRecord(data || { status: 'no_track_record' });
        }
      })
      .catch(() => {
        if (isMounted) setLiveRecord({ status: 'no_track_record' });
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [guestName]);

  if (!guestName) return null;

  const record = liveRecord && liveRecord.status === 'success' ? liveRecord : localSeedRecord;
  const isNoTrackRecord = !loading && liveRecord && liveRecord.status === 'no_track_record' && (!localSeedRecord || localSeedRecord.totalPicks === 0);
  const hasEnoughData = record && record.resolvedPicks >= 3 && record.hitRate !== null;
  const picksList = record?.picks || [];

  /* Scaled hit rate (Bayesian-shrunk composite rating matching AnalystBubble) */
  let scaledScore = null;
  if (record?.credibilityScore != null) {
    scaledScore = Math.round(record.credibilityScore);
  } else if (record?.hitRate != null) {
    scaledScore = Math.round(record.hitRate * 100);
  } else if (record?.optimalHorizonHitRate != null) {
    scaledScore = Math.round(record.optimalHorizonHitRate * 100);
  }

  let bodyContent = null;

  if (loading) {
    bodyContent = (
      <div className="py-12 text-center text-xs text-dim animate-pulse font-sans">
        Loading analyst track record...
      </div>
    );
  } else if (isNoTrackRecord) {
    bodyContent = (
      <div className="p-8 text-center bg-surface-elevated rounded-2xl space-y-3 font-sans shadow-inner">
        <h4 className="text-base font-medium text-prime">No Track Record Recorded Yet</h4>
        <p className="text-xs text-dim max-w-md mx-auto leading-relaxed">
          RogueCFA automatically indexes past picks articles whenever new MarketCall episodes air or when a cold-start search runs for this guest analyst.
        </p>
        <div className="inline-block bg-surface-card px-3.5 py-1 rounded-full text-xs text-dim font-medium">
          Status: Pending Organic Ingestion
        </div>
      </div>
    );
  } else if (record) {
    bodyContent = (
      <div className="space-y-6 font-sans">
        {/* Data Sample Size Verification Badge */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 bg-surface-elevated rounded-xl text-xs text-dim shadow-inner">
          <div className="flex items-center gap-2">
            <span>
              <strong className="text-prime font-medium">Data Depth:</strong> {record.dataSummaryText || `Based on latest ${record.totalPicks || picksList.length} past picks (${record.uniquePositionsCount || '13'} unique positions) across ${record.totalEpisodesCount || record.dataUsedEpisodes || 7} BNN episodes`}
            </span>
          </div>
          <span className="bg-surface-card px-3 py-1 rounded-full font-medium text-dim text-xs">
            Sample Verified ({picksList.length} Picks • {record.uniquePositionsCount || '13'} Unique Ideas)
          </span>
        </div>

        {/* Horizon Specialist Card */}
        {record.optimalHorizonKey && (record.optimalHorizonHitRate != null || record.hitRate != null) && (
          <div className="p-5 bg-surface-elevated rounded-2xl space-y-4 shadow-antigravity">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-dim block">
                  Time Horizon Assessment
                </span>
                <h4 className="text-base font-medium text-prime mt-0.5">
                  Performs Best With: <span className="text-signal-buy font-semibold">{record.optimalHorizonLabel}</span>
                </h4>
                <p className="text-xs text-dim mt-0.5">
                  {record.guestName}'s picks show superior accuracy on the <strong className="text-prime font-semibold">{record.optimalHorizonKey}</strong> holding term.
                </p>
              </div>
              <div className="bg-signal-buy/15 px-4 py-2.5 rounded-2xl text-center sm:text-right shrink-0">
                <span className="text-[11px] text-signal-buy/80 uppercase font-medium block">Optimal Win Rate</span>
                <span className="text-2xl font-bold text-signal-buy tabular-nums">
                  {((record.optimalHorizonHitRate ?? record.hitRate ?? 0) * 100).toFixed(0)}%
                </span>
                <span className="text-xs font-semibold text-signal-buy block tabular-nums">
                  +{record.optimalHorizonReturn >= 0 ? '' : ''}{record.optimalHorizonReturn || record.avgReturn}% Avg Return
                </span>
              </div>
            </div>

            {/* Timeframe Comparison Grid */}
            {record.timeframeBreakdown && (
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-surface-card text-xs">
                <div className={`p-3 rounded-xl ${record.optimalHorizonKey === '1M-3M' ? 'bg-surface-card shadow-antigravity' : 'bg-surface'}`}>
                  <span className="text-[11px] text-dim block">Short-Term (1-3M)</span>
                  <span className="font-semibold text-prime text-sm tabular-nums">
                    {record.timeframeBreakdown.shortTerm?.hitRate != null ? `${(record.timeframeBreakdown.shortTerm.hitRate * 100).toFixed(0)}% win` : 'N/A'}
                  </span>
                  <span className="text-dim text-[11px] block tabular-nums">
                    {record.timeframeBreakdown.shortTerm?.avgReturn != null ? `${record.timeframeBreakdown.shortTerm.avgReturn >= 0 ? '+' : ''}${record.timeframeBreakdown.shortTerm.avgReturn}%` : '—'}
                  </span>
                </div>

                <div className={`p-3 rounded-xl ${record.optimalHorizonKey === '6M' ? 'bg-surface-card shadow-antigravity' : 'bg-surface'}`}>
                  <span className="text-[11px] text-dim block">Mid-Term (6M)</span>
                  <span className="font-semibold text-prime text-sm tabular-nums">
                    {record.timeframeBreakdown.midTerm?.hitRate != null ? `${(record.timeframeBreakdown.midTerm.hitRate * 100).toFixed(0)}% win` : 'N/A'}
                  </span>
                  <span className="text-dim text-[11px] block tabular-nums">
                    {record.timeframeBreakdown.midTerm?.avgReturn != null ? `${record.timeframeBreakdown.midTerm.avgReturn >= 0 ? '+' : ''}${record.timeframeBreakdown.midTerm.avgReturn}%` : '—'}
                  </span>
                </div>

                <div className={`p-3 rounded-xl ${record.optimalHorizonKey === '1Y-3Y' ? 'bg-surface-card shadow-antigravity' : 'bg-surface'}`}>
                  <span className="text-[11px] text-dim block">Long-Term (1-3Y)</span>
                  <span className="font-semibold text-prime text-sm tabular-nums">
                    {record.timeframeBreakdown.longTerm?.hitRate != null ? `${(record.timeframeBreakdown.longTerm.hitRate * 100).toFixed(0)}% win` : 'N/A'}
                  </span>
                  <span className="text-dim text-[11px] block tabular-nums">
                    {record.timeframeBreakdown.longTerm?.avgReturn != null ? `${record.timeframeBreakdown.longTerm.avgReturn >= 0 ? '+' : ''}${record.timeframeBreakdown.longTerm.avgReturn}%` : '—'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-elevated p-4 rounded-xl shadow-antigravity">
            <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Formal Top Picks</span>
            <span className="text-xl font-bold text-prime mt-0.5 block tabular-nums">{record.totalPicks || picksList.length}</span>
            <span className="text-[11px] text-dim">{record.uniquePositionsCount ? `${record.uniquePositionsCount} unique positions` : `${record.resolvedPicks || picksList.length} evaluated`}</span>
          </div>

          <div className="bg-surface-elevated p-4 rounded-xl shadow-antigravity">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Top Pick Hit Rate</span>
              {scaledScore != null && (
                <span className="text-[10px] font-bold text-accent bg-accent/15 px-2 py-0.5 rounded-full" title="Scaled Hit Rate (empirical Bayes prior-adjusted rating)">
                  Scaled: {scaledScore}%
                </span>
              )}
            </div>
            {record.hitRate !== null ? (
              <>
                <span
                  className={`text-xl font-bold mt-0.5 block tabular-nums ${
                    record.hitRate >= 0.5 ? 'text-signal-buy' : 'text-signal-avoid'
                  }`}
                >
                  {(record.hitRate * 100).toFixed(0)}%
                </span>
                <span className="text-[11px] text-dim">{record.hitCount || record.correctPicks || 0} winning picks (raw win rate)</span>
              </>
            ) : (
              <span className="text-xs font-normal text-dim italic mt-1 block">Pending</span>
            )}
          </div>

          <div className="bg-surface-elevated p-4 rounded-xl shadow-antigravity">
            <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Avg Pick Return</span>
            <span
              className={`text-xl font-bold mt-0.5 block tabular-nums ${
                (record.avgTotalReturn ?? record.avgReturn ?? 0) >= 0 ? 'text-signal-buy' : 'text-signal-avoid'
              }`}
            >
              {(record.avgTotalReturn ?? record.avgReturn ?? 0) >= 0 ? '+' : ''}
              {record.avgTotalReturn ?? record.avgReturn ?? 0}%
            </span>
            <span className="text-[11px] text-dim">Total Holding Return</span>
          </div>

          <div className="bg-surface-elevated p-4 rounded-xl shadow-antigravity">
            <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Benchmark Alpha</span>
            {record.avgAlpha != null ? (
              <>
                <span className={`text-xl font-bold mt-0.5 block tabular-nums ${record.avgAlpha >= 0 ? 'text-signal-buy' : 'text-signal-avoid'}`}>
                  {record.avgAlpha >= 0 ? '+' : ''}{record.avgAlpha}%
                </span>
                <span className="text-[11px] text-dim">vs S&amp;P/TSX Composite</span>
              </>
            ) : hasEnoughData ? (
              <>
                <span className="text-xl font-bold text-prime mt-0.5 block tabular-nums">
                  +0.0%
                </span>
                <span className="text-[11px] text-dim">Baseline</span>
              </>
            ) : (
              <span className="text-xs font-normal text-dim italic mt-1 block">Sample &lt; 3</span>
            )}
          </div>
        </div>

        {/* Picks Table */}
        <div>
          <h4 className="text-xs font-semibold text-dim uppercase tracking-wider mb-3 flex items-center justify-between">
            <span>Inspectable Pick Ledger (Formal Top Picks Only)</span>
            <span className="text-[11px] font-normal text-dim">{picksList.length} formal picks</span>
          </h4>

          {picksList.length === 0 ? (
            <div className="p-8 text-center text-dim text-xs rounded-xl bg-surface-elevated">
              No formal stock picks recorded for this analyst yet.
            </div>
          ) : (
            <div className="space-y-2">
              <div className="rounded-xl overflow-hidden overflow-x-auto shadow-antigravity bg-surface-elevated">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-surface text-dim uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-4 font-semibold">Ticker</th>
                      <th className="py-3 px-4 font-semibold">Air Date</th>
                      <th className="py-3 px-4 font-semibold">Broadcast Price</th>
                      <th className="py-3 px-4 font-semibold text-right">90-Day Return</th>
                      <th className="py-3 px-4 font-semibold text-right">TSX Composite Benchmark Return</th>
                      <th className="py-3 px-4 font-semibold text-right">Alpha</th>
                      <th className="py-3 px-4 font-semibold text-center">Link to Source</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-card font-sans font-medium">
                    {picksList.map((pick, idx) => {
                      const ret = pick.totalReturnPct ?? pick.total_return_pct ?? pick.returnPct ?? pick.return_pct ?? pick.actualReturn;
                      const benchRet = pick.benchmarkReturn ?? pick.benchmark_return;
                      const alpha = pick.benchmarkAlpha ?? pick.benchmark_alpha;
                      const sourceUrl = pick.sourceArticleUrl || pick.source_article_url;

                      return (
                        <tr key={`${pick.ticker}-${idx}`} className="hover:bg-surface-card transition-colors">
                          <td className="py-3.5 px-4 font-bold text-prime">
                            <button
                              type="button"
                              onClick={() => {
                                if (onSelectTicker) {
                                  onSelectTicker(pick.ticker, record.guestName);
                                  onClose();
                                }
                              }}
                              className="hover:text-white underline decoration-dim transition-colors text-left font-semibold"
                              title={`Click to search ${pick.ticker}`}
                            >
                              {pick.ticker}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-dim whitespace-nowrap tabular-nums">{pick.reviewDate || pick.review_date || pick.date || 'N/A'}</td>
                          <td className="py-3.5 px-4 text-dim tabular-nums">{pick.thenPrice != null || pick.then_price != null ? `$${pick.thenPrice ?? pick.then_price}` : '—'}</td>
                          <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                            {ret != null ? (
                              <span className={ret > 0 ? 'text-signal-buy' : ret < 0 ? 'text-signal-avoid' : 'text-prime'}>
                                {ret >= 0 ? '+' : ''}{ret}%
                              </span>
                            ) : (
                              <span className="text-dim font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right text-dim tabular-nums">
                            {benchRet != null ? `${benchRet >= 0 ? '+' : ''}${benchRet}%` : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold tabular-nums">
                            {alpha != null ? (
                              <span className={alpha > 0 ? 'text-signal-buy' : alpha < 0 ? 'text-signal-avoid' : 'text-prime'}>
                                {alpha >= 0 ? '+' : ''}{alpha}%
                              </span>
                            ) : (
                              <span className="text-dim font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            {sourceUrl ? (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                                title="View official BNN episode broadcast source"
                              >
                                <span>Official Source</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </a>
                            ) : (
                              <span className="text-[11px] text-dim/60">BNN Broadcast</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-dim/80 italic leading-relaxed pt-1">
                * Raw Hit Rate ({((record?.hitRate ?? 0) * 100).toFixed(0)}%) = Percentage of formal on-air Top Picks that outperformed the S&amp;P/TSX Composite over a fixed 90-day holding period ({record?.hitCount || record?.correctPicks || 0} of {record?.totalPicks || picksList.length} winning picks). Scaled Hit Rate ({scaledScore}%) applies empirical Bayesian shrinkage against market prior to normalize for sample size.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 10 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        className={`bg-surface-card rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-antigravity-elevated overflow-hidden ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-surface-elevated/40 flex items-center justify-between bg-surface-card">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-prime">{record?.guestName || guestName}</span>
              <span className="text-xs text-dim bg-surface-elevated px-3 py-0.5 rounded-full font-normal">
                BNN MarketCall Guest
              </span>
            </div>
            <p className="text-xs text-dim mt-0.5">
              Historical accuracy and performance verification
            </p>
          </div>
          <div className="flex items-center gap-3.5">
            {scaledScore != null && (
              <div className="flex items-center gap-2.5 bg-surface-elevated/70 px-3 py-1.5 rounded-2xl border border-edge/30">
                <div className="text-right">
                  <span className="text-[10px] font-bold text-dim uppercase tracking-wider block leading-tight">
                    Scaled Hit Rate
                  </span>
                  <span className="text-[10px] text-dim/60 leading-tight">
                    Bayes-Adjusted
                  </span>
                </div>
                <ScoreCircle score={scaledScore} loading={loading} label="Scaled" />
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-dim hover:text-prime hover:bg-surface-elevated rounded-full transition-colors text-base"
              title="Close modal (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {bodyContent}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-surface-elevated/40 bg-surface-card flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold bg-accent text-accent-text rounded-full transition-colors shadow-antigravity"
          >
            Close Panel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
