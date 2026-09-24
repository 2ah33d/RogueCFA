import React from 'react';

/**
 * ComparisonMatrix — Google Antigravity aesthetic: 16px radius, soft elevation shadow, task-status pills.
 */
export default function ComparisonMatrix({ scorecards, comparisonResult }) {
  if (!scorecards || scorecards.length < 2) return null;

  const topScorecard = [...scorecards].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
  const winnerTicker = comparisonResult?.winner || topScorecard?.ticker;

  return (
    <section className="w-full bg-surface-card rounded-2xl p-6 sm:p-8 space-y-6 shadow-antigravity">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-surface-elevated/40 pb-5 font-sans">
        <div>
          <span className="text-xs font-semibold text-dim uppercase tracking-wider block mb-1">
            Head-to-Head Analysis
          </span>
          <h3 className="text-xl font-bold text-prime">
            Comparative Matrix ({scorecards.length} Assets)
          </h3>
          <p className="text-xs text-dim mt-0.5">
            Side-by-side evaluation across quantitative math sub-scores and AI trade-off analysis.
          </p>
        </div>

        {winnerTicker && (
          <div className="bg-signal-buy/15 px-4 py-3 rounded-2xl flex items-center gap-3">
            <span className="text-xl">🏆</span>
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-signal-buy block">
                Top Quantitative Candidate
              </span>
              <span className="text-base font-bold font-sans text-signal-buy">
                {winnerTicker}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Side-by-Side Table ── */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-surface-elevated/40 bg-surface-elevated text-xs font-semibold text-dim uppercase tracking-wider">
              <th className="py-3 px-4">Metric / Sub-Score</th>
              {scorecards.map((card) => {
                const isWinner = card.ticker === winnerTicker;
                const isTSX =
                  card.ticker?.toUpperCase().endsWith('.TO') ||
                  card.ticker?.toUpperCase().endsWith('.V') ||
                  card.exchange?.toUpperCase().includes('TORONTO') ||
                  card.exchange?.toUpperCase().includes('TSX') ||
                  card.currency === 'CAD' ||
                  card.country === 'CA';
                return (
                  <th key={card.ticker} className={`py-3 px-4 text-center ${isWinner ? 'bg-surface-card font-bold text-prime' : 'text-dim'}`}>
                    <div className="text-base font-sans font-bold text-prime flex items-center justify-center gap-1.5">
                      {card.ticker}
                      {isWinner && <span className="text-xs text-signal-buy">★</span>}
                      {isTSX && (
                        <span className="text-[10px] text-dim bg-surface px-2 py-0.5 rounded-full font-sans">
                          TSX
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-dim font-normal font-sans truncate max-w-[120px] mx-auto">
                      {card.companyName || card.ticker}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-elevated/40 text-sm font-sans">
            {/* Total Score */}
            <tr>
              <td className="py-3.5 px-4 font-medium text-prime">Total Math Score</td>
              {scorecards.map((card) => {
                const isWinner = card.ticker === winnerTicker;
                return (
                  <td key={card.ticker} className={`py-3.5 px-4 text-center font-sans font-bold ${isWinner ? 'text-prime' : 'text-dim'}`}>
                    <span className="text-lg">{card.score}</span>
                    <span className="text-xs text-dim">/100 ({card.grade})</span>
                  </td>
                );
              })}
            </tr>

            {/* Signal */}
            <tr>
              <td className="py-3.5 px-4 font-normal text-dim">Signal</td>
              {scorecards.map((card) => (
                <td key={card.ticker} className="py-3.5 px-4 text-center font-sans">
                  <span
                    className={`inline-block text-xs font-semibold px-3 py-1 rounded-full uppercase ${
                      card.signal === 'BUY_SIGNAL'
                        ? 'bg-signal-buy/15 text-signal-buy'
                        : card.signal === 'AVOID'
                          ? 'bg-signal-avoid/15 text-signal-avoid'
                          : 'bg-signal-watch/15 text-signal-watch'
                    }`}
                  >
                    {card.signal === 'BUY_SIGNAL' ? 'BUY' : card.signal || 'WATCH'}
                  </span>
                </td>
              ))}
            </tr>

            {/* Consensus Sub-Score */}
            <tr>
              <td className="py-3.5 px-4 font-normal text-dim">Analyst Consensus</td>
              {scorecards.map((card) => (
                <td key={card.ticker} className="py-3.5 px-4 text-center font-sans text-prime">
                  {card.score_breakdown?.consensus ?? '—'} pts
                </td>
              ))}
            </tr>

            {/* Momentum Sub-Score */}
            <tr>
              <td className="py-3.5 px-4 font-normal text-dim">Price Momentum</td>
              {scorecards.map((card) => (
                <td key={card.ticker} className="py-3.5 px-4 text-center font-sans text-prime">
                  {card.score_breakdown?.momentum ?? '—'} pts
                </td>
              ))}
            </tr>

            {/* Valuation Sub-Score */}
            <tr>
              <td className="py-3.5 px-4 font-normal text-dim">Valuation Reasonableness</td>
              {scorecards.map((card) => (
                <td key={card.ticker} className="py-3.5 px-4 text-center font-sans text-prime">
                  {card.score_breakdown?.valuation != null ? `${card.score_breakdown.valuation} pts` : <span className="text-dim text-xs font-sans">N/A</span>}
                </td>
              ))}
            </tr>

            {/* Earnings Sub-Score */}
            <tr>
              <td className="py-3.5 px-4 font-normal text-dim">Earnings Beat / Trend</td>
              {scorecards.map((card) => (
                <td key={card.ticker} className="py-3.5 px-4 text-center font-sans text-prime">
                  {card.score_breakdown?.earnings != null ? `${card.score_breakdown.earnings} pts` : <span className="text-dim text-xs font-sans">N/A</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── AI Comparative Narrative ── */}
      {comparisonResult && (
        <div className="bg-surface-elevated rounded-2xl p-6 space-y-4 font-sans shadow-inner">
          {comparisonResult.comparative_summary && (
            <div>
              <h4 className="text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                Comparative Summary
              </h4>
              <p className="text-xs text-prime leading-relaxed">
                {comparisonResult.comparative_summary}
              </p>
            </div>
          )}

          {Array.isArray(comparisonResult.key_tradeoffs) && comparisonResult.key_tradeoffs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">
                Relative Trade-Offs
              </h4>
              <ul className="space-y-1.5">
                {comparisonResult.key_tradeoffs.map((item, i) => (
                  <li key={i} className="text-xs text-dim flex items-start gap-2">
                    <span className="text-prime font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
