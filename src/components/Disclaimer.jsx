import React from 'react';
import { Lock } from 'lucide-react';

/**
 * Disclaimer — Persistent legal compliance footer.
 * Enforces Canadian Securities Law regulatory safeguards:
 * 1. Explicitly defines "FA" as "Financial Aggregation" (not financial advisor).
 * 2. Highlights "Not Investment Advice | Delayed Data | Factual Summarization Only".
 * 3. Incorporates privacy-safe audience indicator and discrete Admin Portal access.
 */
export default function Disclaimer({ onOpenAdmin, trafficStats, className = '' }) {
  return (
    <footer className={`w-full bg-surface-card/40 border-t border-surface-card/60 font-sans py-4 transition-all ${className}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col items-center gap-3 text-center">
        {/* Core Warning Bar */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-signal-watch/15 text-signal-watch font-semibold text-[11px] tracking-wide uppercase">
            Regulatory Notice
          </span>
          <span className="font-semibold text-prime">
            Not Investment Advice · Delayed Market Data · Factual Summarization Only
          </span>
        </div>

        {/* Legal Text & FA Definition */}
        <p className="text-[11px] text-dim max-w-4xl leading-relaxed">
          <strong className="text-prime font-medium">RogueFA (Automated Public Broadcast Aggregation)</strong> is a computational software and market research technology platform. &ldquo;FA&rdquo; stands for <strong className="text-prime font-medium">Financial Aggregation</strong>. RogueFA is not a registered financial advisor, portfolio manager, or broker-dealer under Canadian provincial securities regulations (BCSC, OSC) or international regulatory bodies. All broadcast digests, quotes, and hit rate calculations represent automated extractions of publicly broadcast media for informational, historical, and educational purposes only.
        </p>

        {/* Footer Sub-row: Audience & Admin Portal Trigger */}
        <div className="w-full pt-2 border-t border-surface-elevated/30 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-dim/70">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            <span>
              {trafficStats?.totalVisitors ? `${trafficStats.totalVisitors.toLocaleString()} all-time unique visitor${trafficStats.totalVisitors === 1 ? '' : 's'}` : 'Privacy-safe broadcast telemetry'}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={onOpenAdmin}
              className="inline-flex items-center gap-1.5 text-dim hover:text-prime transition-colors cursor-pointer select-none"
              title="Access Admin Console (or press Ctrl+Shift+A)"
            >
              <Lock className="w-3 h-3" />
              <span>Admin Portal</span>
            </button>
            <span>·</span>
            <span>&copy; {new Date().getFullYear()} RogueFA. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
