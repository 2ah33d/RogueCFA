import React, { useState, useEffect } from 'react';
import { getHistory, clearHistory } from '../lib/historyManager';
import Scorecard from './Scorecard';

/**
 * HistoryTab — Google Antigravity aesthetic: 16px radius cards, soft elevation shadows, task-status pills.
 */
export default function HistoryTab({ onSelectTicker, className = '' }) {
  const [history, setHistory] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleClear = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearHistory();
    setHistory([]);
    setConfirmClear(false);
  };

  const totalScored = history.length;
  let correctCount = 0;
  let resolvedCount = 0;
  let buyReturnSum = 0;
  let buyReturnCount = 0;

  for (const item of history) {
    if (item.outcome !== null) {
      resolvedCount++;
      if (item.outcome === 'CORRECT') {
        correctCount++;
      }
    }
    if (item.signal === 'BUY_SIGNAL' && item.actualReturn != null && !isNaN(item.actualReturn)) {
      buyReturnSum += Number(item.actualReturn);
      buyReturnCount++;
    }
  }

  const correctPct = resolvedCount > 0 ? ((correctCount / resolvedCount) * 100).toFixed(0) : '0';
  const avgBuyReturn = buyReturnCount > 0 ? (buyReturnSum / buyReturnCount).toFixed(2) : '0.00';

  if (totalScored === 0) {
    return (
      <div className={`w-full max-w-5xl mx-auto p-12 text-center bg-surface-card rounded-2xl shadow-antigravity animate-fade-in ${className}`}>
        <div className="text-xs font-semibold uppercase tracking-wider text-dim mb-3">HISTORICAL EVALUATIONS</div>
        <h3 className="text-xl font-bold text-prime mb-2">No scoring history yet.</h3>
        <p className="text-xs text-dim max-w-md mx-auto">
          Score a ticker on the main scorecard view to get started. Every evaluation will be logged here automatically with price outcome tracking.
        </p>
      </div>
    );
  }

  return (
    <div className={`w-full max-w-6xl mx-auto space-y-6 animate-fade-in ${className}`}>
      {/* Summary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-surface-card rounded-2xl shadow-antigravity font-sans">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-surface-elevated rounded-xl text-prime font-sans font-semibold text-xs shadow-inner">
            SUM
          </div>
          <div>
            <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Total Scored</span>
            <span className="text-2xl font-bold font-sans text-prime">{totalScored}</span>
            <span className="text-xs text-dim block mt-0.5 font-sans">Historical evaluations</span>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-surface-elevated/40 pt-4 md:pt-0 md:pl-6">
          <div className="p-3 bg-signal-buy/15 rounded-xl text-signal-buy font-sans font-semibold text-xs">
            ACC
          </div>
          <div>
            <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Correct %</span>
            <span className="text-2xl font-bold font-sans text-signal-buy">{correctPct}%</span>
            <span className="text-xs text-dim block mt-0.5 font-sans">
              {correctCount} of {resolvedCount} resolved calls
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-surface-elevated/40 pt-4 md:pt-0 md:pl-6">
          <div className="p-3 bg-surface-elevated rounded-xl text-prime font-sans text-xs shadow-inner">
            RET
          </div>
          <div>
            <span className="text-xs text-dim uppercase tracking-wider font-semibold block">Avg BUY Return</span>
            <span className={`text-2xl font-bold font-sans ${Number(avgBuyReturn) >= 0 ? 'text-signal-buy' : 'text-signal-avoid'}`}>
              {Number(avgBuyReturn) >= 0 ? '+' : ''}{avgBuyReturn}%
            </span>
            <span className="text-xs text-dim block mt-0.5 font-sans">Across BUY calls</span>
          </div>
        </div>
      </div>

      {/* Table Header & Controls */}
      <div className="flex items-center justify-between px-1 font-sans">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-prime">
            Score History &amp; Outcomes
          </h3>
          <span className="text-xs text-dim bg-surface-card px-3 py-0.5 rounded-full font-normal shadow-antigravity">
            Auto-saved
          </span>
        </div>

        <div className="flex items-center gap-3">
          {confirmClear ? (
            <div className="flex items-center gap-2 animate-fade-in">
              <span className="text-xs text-danger font-medium">Delete all history?</span>
              <button
                type="button"
                onClick={handleClear}
                className="px-3 py-1 text-xs font-semibold bg-danger text-white rounded-full transition-colors shadow-antigravity"
              >
                Yes, Clear
              </button>
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="px-3 py-1 text-xs bg-surface-card hover:bg-surface-elevated text-dim hover:text-prime rounded-full transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-1.5 text-xs text-dim hover:text-danger bg-surface-card hover:bg-surface-elevated rounded-full transition-colors font-medium shadow-antigravity"
            >
              Clear History
            </button>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-surface-card rounded-2xl overflow-hidden shadow-antigravity">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-elevated text-dim uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold w-10 text-center">#</th>
                <th className="py-3 px-4 font-semibold">Ticker</th>
                <th className="py-3 px-4 font-semibold">Date</th>
                <th className="py-3 px-4 font-semibold">Hold Period</th>
                <th className="py-3 px-4 font-semibold">Score</th>
                <th className="py-3 px-4 font-semibold">Signal</th>
                <th className="py-3 px-4 font-semibold text-right">Return</th>
                <th className="py-3 px-6 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-elevated/40 font-sans">
              {history.map((entry, idx) => {
                const isExpanded = expandedId === entry.id;
                const dateStr = entry.date
                  ? new Date(entry.date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'N/A';

                let outcomeBadge = null;
                if (entry.outcome === 'CORRECT') {
                  outcomeBadge = (
                    <span className="inline-flex items-center text-xs font-semibold text-signal-buy bg-signal-buy/15 px-3 py-1 rounded-full">
                      CORRECT
                    </span>
                  );
                } else if (entry.outcome === 'INCORRECT') {
                  outcomeBadge = (
                    <span className="inline-flex items-center text-xs font-semibold text-signal-avoid bg-signal-avoid/15 px-3 py-1 rounded-full">
                      INCORRECT
                    </span>
                  );
                } else if (entry.outcome === 'NEUTRAL') {
                  outcomeBadge = (
                    <span className="inline-flex items-center text-xs font-semibold text-signal-watch bg-signal-watch/15 px-3 py-1 rounded-full">
                      NEUTRAL
                    </span>
                  );
                } else {
                  let countdownText = 'Pending';
                  if (entry.targetDate) {
                    const diffTime = new Date(entry.targetDate).getTime() - new Date().getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) {
                      countdownText = `Pending (${diffDays}d left)`;
                    } else {
                      countdownText = `Resolving...`;
                    }
                  }
                  outcomeBadge = (
                    <span className="inline-flex items-center text-xs text-dim bg-surface-elevated px-3 py-1 rounded-full font-sans">
                      {countdownText}
                    </span>
                  );
                }

                return (
                  <React.Fragment key={entry.id || idx}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                      className="hover:bg-surface-elevated transition-colors cursor-pointer select-none group"
                    >
                      <td className="py-4 px-4 text-center text-dim group-hover:text-prime font-sans">
                        <span>{isExpanded ? '▼' : '▶'}</span>
                      </td>
                      <td className="py-4 px-4 font-bold text-prime text-sm">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectTicker) onSelectTicker(entry.ticker);
                          }}
                          className="hover:text-prime underline decoration-dim transition-colors text-left font-sans"
                          title={`Click to score ${entry.ticker}`}
                        >
                          {entry.ticker}
                        </button>
                        <span className="block text-[11px] text-dim font-normal font-sans truncate max-w-[120px]">
                          {entry.companyName || entry.ticker}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-dim whitespace-nowrap font-sans">{dateStr}</td>
                      <td className="py-4 px-4 text-prime font-sans">{entry.holdPeriod || '6M'}</td>
                      <td className="py-4 px-4 font-sans">
                        <span className="font-bold text-base text-prime">{entry.score}</span>
                        <span className="text-xs text-dim">/100 ({entry.grade})</span>
                      </td>
                      <td className="py-4 px-4 font-sans">
                        <span
                          className={`text-xs font-semibold px-3 py-1 rounded-full uppercase ${
                            entry.signal === 'BUY_SIGNAL'
                              ? 'bg-signal-buy/15 text-signal-buy'
                              : entry.signal === 'AVOID'
                                ? 'bg-signal-avoid/15 text-signal-avoid'
                                : 'bg-signal-watch/15 text-signal-watch'
                          }`}
                        >
                          {entry.signal === 'BUY_SIGNAL' ? 'BUY' : entry.signal || 'WATCH'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right font-sans font-bold">
                        {entry.actualReturn != null && !isNaN(entry.actualReturn) ? (
                          <span
                            className={
                              entry.actualReturn > 0
                                ? 'text-signal-buy'
                                : entry.actualReturn < 0
                                  ? 'text-signal-avoid'
                                  : 'text-prime'
                            }
                          >
                            {entry.actualReturn >= 0 ? '+' : ''}
                            {entry.actualReturn}%
                          </span>
                        ) : (
                          <span className="text-dim font-normal">—</span>
                        )}
                      </td>
                      <td className="py-4 px-6">{outcomeBadge}</td>
                    </tr>

                    {/* Expandable Row Content */}
                    {isExpanded && (
                      <tr className="bg-surface-elevated">
                        <td colSpan={8} className="p-6">
                          <div className="max-w-4xl mx-auto space-y-4 animate-fade-in font-sans">
                            <div className="flex items-center justify-between text-xs text-dim bg-surface-card p-4 rounded-xl shadow-antigravity">
                              <div>
                                <span className="text-dim">Scored Price: </span>
                                <span className="text-prime font-semibold font-sans">
                                  {entry.priceAtScore > 0 ? `$${Number(entry.priceAtScore).toFixed(2)}` : 'N/A'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dim">Current/Final Price: </span>
                                <span className="text-prime font-semibold font-sans">
                                  {entry.finalPrice > 0 ? `$${Number(entry.finalPrice).toFixed(2)}` : 'Pending'}
                                </span>
                              </div>
                              <div>
                                <span className="text-dim">Target Resolution Date: </span>
                                <span className="text-prime font-semibold font-sans">
                                  {entry.targetDate ? new Date(entry.targetDate).toLocaleDateString() : 'N/A'}
                                </span>
                              </div>
                            </div>

                            <Scorecard
                              data={entry.scorecardData || entry}
                              holdPeriod={entry.holdPeriod || '6M'}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
