import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

import { detectStockMarket } from '../lib/priceFetcher';

/**
 * Render a color-coded stance flag badge based on analyst evaluation
 * green flag if buy
 * red flag if sell
 * yellow flag if hold
 * grey flag if unsure/neutral
 */
function renderStanceFlag(stance) {
  if (!stance) return null;
  const s = String(stance).toLowerCase().trim();

  if (s === 'buy') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-emerald-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>
        </svg>
        <span>BUY</span>
      </span>
    );
  }
  if (s === 'sell') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-rose-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>
        </svg>
        <span>SELL</span>
      </span>
    );
  }
  if (s === 'hold') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-amber-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>
        </svg>
        <span>HOLD</span>
      </span>
    );
  }
  if (s === 'unsure' || s === 'grey' || s === 'neutral' || s === 'mixed') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-slate-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/>
        </svg>
        <span>UNSURE</span>
      </span>
    );
  }
  return null;
}

/**
 * Render subtle country / market badge to differentiate TSX (CAD) vs US (USD)
 */
function renderMarketBadge(market) {
  if (!market) return null;
  const isCad = market === 'CAD';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
        isCad
          ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
          : 'bg-sky-500/10 text-sky-300 border-sky-500/25'
      }`}
      title={isCad ? 'Canadian TSX Listing (CAD)' : 'US Listing (USD)'}
    >
      <span>{isCad ? '🇨🇦 TSX' : '🇺🇸 US'}</span>
    </span>
  );
}

export default function DigestPickCard({
  ticker,
  company,
  reasoning,
  guestName,
  onScoreTicker,
  index = 0,
  isCallerMention = false,
  stance = null,
  priceFormatted = null,
  market = null,
  quote = null,
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRef = useRef(null);
  const layoutKey = `pick-card-${ticker}-${index}`;

  const effectiveStance = stance || (isCallerMention ? null : 'buy');
  const detectedMarket = market || detectStockMarket(ticker, company, reasoning, quote);

  const preview = reasoning
    ? reasoning.length > 100
      ? reasoning.slice(0, 100).trim() + '…'
      : reasoning
    : 'No reasoning provided.';

  const handleOpen = useCallback(() => {
    /* 1. Scroll card smoothly to vertical center of screen */
    if (cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    /* 2. Trigger shared layout morph from top-left origin after short delay */
    setTimeout(() => {
      setExpanded(true);
    }, 80);
  }, []);

  const handleClose = useCallback(() => {
    setExpanded(false);
  }, []);

  /* Close on Escape key */
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [expanded, handleClose]);

  /* Lock body scroll when modal is open */
  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [expanded]);

  return (
    <>
      {/* Collapsed card — morph origin with symmetrical right-aligned price */}
      {!expanded ? (
        <motion.div
          ref={cardRef}
          layoutId={layoutKey}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          whileHover={{ scale: 1.008, y: -1 }}
          whileTap={{ scale: 0.99 }}
          className="bg-surface-card rounded-2xl overflow-hidden shadow-antigravity font-sans cursor-pointer group"
          onClick={handleOpen}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpen(); } }}
        >
          <div className="w-full text-left px-5 py-4 sm:py-5 flex items-start gap-3.5 sm:gap-4">
            {/* Ticker badge — clean, uniform single pill */}
            <div className="flex-shrink-0 mt-0.5">
              <span className="inline-flex items-center font-bold text-sm text-prime bg-surface-elevated px-3.5 py-1.5 rounded-full">
                {ticker}
              </span>
            </div>

            {/* Content & Right-Aligned Price */}
            <div className="flex-1 min-w-0">
              {/* Header row: Company & badges on left, live price & chevron on right */}
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <h4 className="text-base font-semibold text-prime truncate">
                    {company || ticker}
                  </h4>
                  {renderStanceFlag(effectiveStance)}
                  {renderMarketBadge(detectedMarket)}
                  {isCallerMention && (
                    <span className="text-[10px] font-normal px-2.5 py-0.5 rounded-full bg-surface-elevated text-dim">
                      Caller Q&amp;A
                    </span>
                  )}
                </div>

                {/* Right-aligned Live Price & Expand Chevron */}
                <div className="flex items-center gap-2.5 shrink-0">
                  {priceFormatted ? (
                    <span className="text-sm font-bold text-prime tabular-nums tracking-tight">
                      {priceFormatted}
                    </span>
                  ) : null}
                  <svg
                    className="w-5 h-5 text-dim/70 group-hover:text-prime transition-transform group-hover:translate-y-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Reasoning Preview */}
              <p className="text-sm text-dim leading-relaxed line-clamp-2">
                {preview}
              </p>
            </div>
          </div>
        </motion.div>
      ) : (
        /* Placeholder in list layout to prevent height jump when item morphs out */
        <div className="h-[88px] w-full rounded-2xl bg-surface-card/30 opacity-50" />
      )}

      {/* Expanded Modal Overlay via Portal */}
      {createPortal(
        <AnimatePresence>
          {expanded && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
              {/* Toned down soft backdrop */}
              <motion.div
                key="pick-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="fixed inset-0 bg-[#1E1F22]/55 backdrop-blur-[3px]"
                onClick={handleClose}
              />

              {/* Expanded Card — Morphs directly from original card bounds top-left origin */}
              <motion.div
                key="pick-expanded-panel"
                layoutId={layoutKey}
                style={{ transformOrigin: '0% 0%' }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                className="relative z-10 w-full max-w-2xl bg-surface-card rounded-2xl p-7 sm:p-9 shadow-antigravity-elevated overflow-hidden font-sans mx-auto"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header: Symmetrical Layout with Live Price on Right */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.08, duration: 0.2 }}
                  className="flex items-start justify-between gap-4 mb-6"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="inline-flex items-center font-bold text-base text-prime bg-surface-elevated px-4 py-1.5 rounded-full mt-0.5 shrink-0">
                      {ticker}
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xl font-bold text-prime leading-snug">
                        {company || ticker}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {renderStanceFlag(effectiveStance)}
                        {renderMarketBadge(detectedMarket)}
                        {isCallerMention && (
                          <span className="text-[11px] font-normal px-2.5 py-0.5 rounded-full bg-surface-elevated text-dim inline-block">
                            Caller Q&amp;A
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Header Controls: Live Quote & Close Button */}
                  <div className="flex items-center gap-3 shrink-0">
                    {priceFormatted && (
                      <div className="text-right bg-surface-elevated/70 px-3.5 py-1.5 rounded-xl border border-edge/30">
                        <span className="text-[10px] text-dim block uppercase tracking-wider font-semibold">Live Quote</span>
                        <span className="text-base font-bold text-prime tabular-nums">
                          {priceFormatted}
                        </span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-8 h-8 flex items-center justify-center rounded-full text-dim hover:text-prime hover:bg-surface-elevated transition-colors"
                      aria-label="Close"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </motion.div>

                {/* High Readability Reasoning Text (text-base, text-prime) */}
                <motion.blockquote
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.12, duration: 0.22 }}
                  className="text-base text-prime leading-relaxed pl-5 border-l-4 border-accent mb-7 font-sans font-normal"
                >
                  {reasoning || 'No detailed reasoning available.'}
                </motion.blockquote>

                {/* Primary CTA Button */}
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: 0.15, duration: 0.22 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClose();
                    if (onScoreTicker) onScoreTicker(ticker, guestName);
                  }}
                  className="inline-flex items-center gap-2 px-7 py-3 bg-accent text-accent-text text-sm font-semibold rounded-full hover:bg-accent-hover transition-colors shadow-antigravity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Score This Pick
                </motion.button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
