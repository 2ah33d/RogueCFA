import React from 'react';

/**
 * LandingPage — Marketing landing page for RogueCFA at root route.
 * Google Antigravity aesthetic: warm charcoal #1E1F22, 16px radius, soft elevation shadows, desaturated #8AB4F8 CTA accent.
 */
export default function LandingPage({ onLaunchTool, onSelectTicker, onSelectGuest, trafficStats }) {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-16 py-4 animate-fade-in font-sans">
      {/* ── 1. HERO SECTION ── */}
      <section className="text-center space-y-6 pt-4">
        {/* Regulatory Brand Badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-surface-card border border-surface-elevated/60 text-xs text-dim">
          <span className="w-2 h-2 rounded-full bg-signal-buy" />
          <span className="font-semibold text-prime">RogueFA</span>
          <span className="text-dim/50">·</span>
          <span>Automated Financial Analytics</span>
        </div>

        {/* Signature Proof Stat as Headline */}
        <div className="space-y-2">
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight text-prime">
            45 minutes → 2 minutes.
          </h1>
          <p className="text-2xl sm:text-3xl md:text-4xl font-semibold text-dim tracking-tight">
            ~$0.04 per digest.
          </p>
        </div>

        {/* Muted One-line Subhead */}
        <p className="text-xs sm:text-sm text-dim max-w-xl mx-auto leading-relaxed font-sans">
          Public financial broadcasts compressed into structured, trackable digests for retail investors who don&apos;t have 45 minutes a day.
        </p>

        {/* Audience Proof Stat */}
        <div className="flex items-center justify-center gap-2 text-xs text-dim">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>
            <strong className="text-prime font-semibold">{trafficStats?.totalVisitors ? trafficStats.totalVisitors.toLocaleString() : '1'}</strong> all-time unique visitor{trafficStats?.totalVisitors === 1 ? '' : 's'} · Privacy-safe analytics
          </span>
        </div>

        {/* Primary CTA */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => onLaunchTool('digest')}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent text-accent-text hover:bg-accent-hover text-sm font-semibold rounded-full transition-all shadow-antigravity cursor-pointer"
          >
            Launch Broadcast Radar
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>

        {/* ── Primary Visual: Split View (Before / After Transformation) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left pt-6">
          {/* Left: Raw Broadcast Representation */}
          <div className="bg-surface-card rounded-2xl p-6 shadow-antigravity flex flex-col justify-between space-y-4 font-sans">
            <div>
              <div className="flex items-center justify-between text-xs text-dim pb-3 border-b border-surface-elevated/40">
                <span className="font-semibold text-[11px] uppercase tracking-wider">RAW BROADCAST</span>
                <span className="font-medium text-[11px] text-dim">45:00 · BNN Bloomberg</span>
              </div>
              <div className="mt-4 space-y-3">
                <div className="h-32 bg-surface-elevated rounded-xl p-4 flex flex-col justify-between shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-dim bg-surface px-2.5 py-0.5 rounded-full">LIVE VIDEO STREAM</span>
                    <span className="text-[10px] font-medium text-dim">45:00 / 45:00</span>
                  </div>
                  <p className="text-xs text-dim italic line-clamp-3 leading-relaxed">
                    &ldquo;So we really like Keyera here, dividend yield is strong, energy infrastructure is rebounding... but caller on line 3 wants to know about Tourmaline...&rdquo;
                  </p>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-2 w-full bg-surface-elevated rounded-full overflow-hidden">
                    <div className="h-full w-full bg-dim/40 rounded-full" />
                  </div>
                  <div className="flex justify-between text-[10px] font-medium text-dim">
                    <span>00:00</span>
                    <span>Talking Head Broadcast</span>
                    <span>45:00</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-dim pt-3 border-t border-surface-elevated/40">
              Unstructured video • 45 min time commitment • No performance tracking
            </div>
          </div>

          {/* Right: Compressed Structured Digest Card */}
          <div className="bg-surface-card rounded-2xl p-6 shadow-antigravity flex flex-col justify-between space-y-4 font-sans">
            <div>
              <div className="flex items-center justify-between text-xs text-dim pb-3 border-b border-surface-elevated/40">
                <span className="font-semibold text-[11px] uppercase tracking-wider">STRUCTURED DIGEST</span>
                <span className="font-semibold text-[11px] text-signal-buy bg-signal-buy/15 px-2.5 py-0.5 rounded-full">2-MIN READ</span>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-sm font-semibold text-prime">Eric Nuttall</div>
                  <div className="text-xs text-dim">Senior Portfolio Manager · Ninepoint Partners</div>
                </div>
                <div className="text-xs text-prime leading-relaxed bg-surface-elevated p-4 rounded-xl shadow-inner">
                  <span className="text-dim block text-[10px] font-semibold uppercase mb-1">Market Outlook</span>
                  Nuttall sees Canadian energy infrastructure names trading at compressed multiples despite strong Q2 free cash flow generation.
                </div>
                <div className="bg-surface-elevated p-4 rounded-xl shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-prime">KEY · Keyera Corp (TSX)</span>
                    <span className="text-xs font-semibold text-signal-buy bg-signal-buy/15 px-2.5 py-0.5 rounded-full">+26.8% return</span>
                  </div>
                  <p className="text-xs text-dim mt-1.5 leading-relaxed">
                    High dividend coverage, low balance sheet leverage, beneficiary of Western Canadian gas egress expansion.
                  </p>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-dim pt-3 border-t border-surface-elevated/40">
              Structured digest • 2 min read • 89% verified track record
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. PROOF OF ACCOUNTABILITY (Plain Text Row with Subtle Dividers) ── */}
      <section className="space-y-4 pt-6 border-t border-surface-elevated/40">
        <div className="text-center">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">
            Verified Top Pick Hit Rates
          </h3>
          <p className="text-xs text-dim mt-1">
            Tracking public broadcast guests over time strictly on formal Top Picks against S&amp;P/TSX and S&amp;P 500 benchmarks (excluding caller Q&amp;A).
          </p>
        </div>

        {/* Plain text row with subtle dividers */}
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 py-4 text-xs font-sans text-prime">
          <button
            type="button"
            onClick={() => onSelectGuest && onSelectGuest('Eric Nuttall')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            <span className="font-semibold text-prime">Eric Nuttall</span>
            <span className="text-dim mx-2">·</span>
            <span className="font-semibold text-signal-buy">89% hit rate</span>
            <span className="text-dim mx-2">·</span>
            <span className="text-dim font-medium">9 picks</span>
          </button>

          <span className="text-dim/30 hidden sm:inline">|</span>

          <button
            type="button"
            onClick={() => onSelectGuest && onSelectGuest('Brian Acker')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            <span className="font-semibold text-prime">Brian Acker</span>
            <span className="text-dim mx-2">·</span>
            <span className="font-semibold text-signal-buy">83% hit rate</span>
            <span className="text-dim mx-2">·</span>
            <span className="text-dim font-medium">12 picks</span>
          </button>

          <span className="text-dim/30 hidden sm:inline">|</span>

          <button
            type="button"
            onClick={() => onSelectGuest && onSelectGuest('Christine Poole')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            <span className="font-semibold text-prime">Christine Poole</span>
            <span className="text-dim mx-2">·</span>
            <span className="font-semibold text-signal-buy">80% hit rate</span>
            <span className="text-dim mx-2">·</span>
            <span className="text-dim font-medium">10 picks</span>
          </button>

          <span className="text-dim/30 hidden sm:inline">|</span>

          <button
            type="button"
            onClick={() => onSelectGuest && onSelectGuest('John Stephenson')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            <span className="font-semibold text-prime">John Stephenson</span>
            <span className="text-dim mx-2">·</span>
            <span className="font-semibold text-signal-buy">78% hit rate</span>
            <span className="text-dim mx-2">·</span>
            <span className="text-dim font-medium">14 picks</span>
          </button>
        </div>
      </section>

      {/* ── 3. HOW IT WORKS (3 Real Grounded Steps) ── */}
      <section className="space-y-6 pt-6 border-t border-surface-elevated/40">
        <div className="text-center">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">
            How It Works
          </h3>
          <p className="text-xs text-dim mt-1">
            Grounded data pipeline from broadcast to verified scorecard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface-card rounded-2xl p-6 shadow-antigravity space-y-2">
            <span className="text-xs font-bold text-accent block">01</span>
            <h4 className="text-sm font-semibold text-prime">Transcribe Broadcast</h4>
            <p className="text-xs text-dim leading-relaxed">
              Automated audio pipeline captures daily broadcast episodes from public streams into full text transcripts.
            </p>
          </div>

          <div className="bg-surface-card rounded-2xl p-6 shadow-antigravity space-y-2">
            <span className="text-xs font-bold text-accent block">02</span>
            <h4 className="text-sm font-semibold text-prime">Extract Picks &amp; Q&amp;A</h4>
            <p className="text-xs text-dim leading-relaxed">
              Deterministic parsing extracts formal Top Picks, caller inquiries, and thesis points directly from broadcast audio.
            </p>
          </div>

          <div className="bg-surface-card rounded-2xl p-6 shadow-antigravity space-y-2">
            <span className="text-xs font-bold text-accent block">03</span>
            <h4 className="text-sm font-semibold text-prime">Grade Analyst Records</h4>
            <p className="text-xs text-dim leading-relaxed">
              Benchmark-adjusted alpha (S&amp;P/TSX &amp; S&amp;P 500) and Bayesian shrinkage compute objective hit rates over time.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. EMBEDDED SAMPLE DIGEST ── */}
      <section className="space-y-4 pt-6 border-t border-surface-elevated/40">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-dim">
              Sample Broadcast Digest
            </h3>
            <p className="text-xs text-dim mt-0.5">
              Example output generated from public broadcast (Source: BNN Bloomberg broadcast).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onLaunchTool('digest')}
            className="text-xs text-dim hover:text-prime font-medium transition-colors"
          >
            Browse All Digests →
          </button>
        </div>

        <div className="bg-surface-card rounded-2xl p-6 sm:p-8 space-y-5 shadow-antigravity">
          <div className="flex items-center justify-between border-b border-surface-elevated/40 pb-4">
            <div>
              <span className="text-sm font-semibold text-prime">Eric Nuttall</span>
              <span className="text-xs text-dim block">Ninepoint Partners · Senior Portfolio Manager</span>
            </div>
            <span className="text-xs font-medium text-dim bg-surface-elevated px-3 py-1 rounded-full">
              Episode: 2026-07-24
            </span>
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-dim mb-1.5">
              Market Outlook
            </h5>
            <p className="text-xs text-prime leading-relaxed">
              Nuttall believes Canadian energy infrastructure names are significantly undervalued relative to US peers. Free cash flow yields across TSX midstream equities remain above 12%, offering downside margin of safety despite broader macro volatility.
            </p>
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wider text-dim mb-2">
              Top Pick
            </h5>
            <div className="bg-surface-elevated rounded-xl p-4 space-y-2 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-prime">KEY · Keyera Corp (TSX)</span>
                <span className="text-xs text-signal-buy font-semibold bg-signal-buy/15 px-2.5 py-0.5 rounded-full">+26.8% Total Return</span>
              </div>
              <p className="text-xs text-dim leading-relaxed">
                Strong Q2 cash flow results, 6.2% dividend yield backed by long-term take-or-pay contracts, and key exposure to Western Canadian natural gas processing infrastructure.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. SIMPLE CTA ── */}
      <section className="text-center space-y-4 pt-8 pb-10 border-t border-surface-elevated/40">
        <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-prime">
          Track daily broadcast analyst picks with zero effort.
        </h3>
        <p className="text-xs text-dim max-w-md mx-auto">
          Automated audio transcription, structured top picks, and verified analyst track records.
        </p>
        <div>
          <button
            type="button"
            onClick={() => onLaunchTool('digest')}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-accent text-accent-text hover:bg-accent-hover text-sm font-semibold rounded-full transition-all shadow-antigravity cursor-pointer"
          >
            Launch Broadcast Radar
          </button>
        </div>
      </section>
    </div>
  );
}
