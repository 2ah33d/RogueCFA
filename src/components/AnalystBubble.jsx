import React, { useState, useEffect } from 'react';
import { getCachedAnalystRecord, saveCachedAnalystRecord } from '../lib/guestTracker';

/**
 * Circular score ring component matching main scoring engine aesthetic.
 */
function ScoreCircle({ score, loading }) {
  const RADIUS = 18;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  if (loading && score == null) {
    return (
      <div className="flex flex-col items-center justify-center shrink-0">
        <div className="w-12 h-12 rounded-full border-2 border-surface-elevated border-t-dim animate-spin" />
        <span className="text-[10px] font-semibold text-dim/70 tracking-wider uppercase mt-1">Credibility</span>
      </div>
    );
  }

  const clamped = Math.max(0, Math.min(100, score || 0));
  const strokeOffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;

  let colorClass = 'stroke-signal-buy text-signal-buy';
  if (score < 65) {
    colorClass = 'stroke-signal-avoid text-signal-avoid';
  } else if (score < 80) {
    colorClass = 'stroke-signal-watch text-signal-watch';
  }

  return (
    <div className="flex flex-col items-center justify-center shrink-0">
      <div className="relative w-12 h-12 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 44 44">
          {/* Background circle track */}
          <circle
            cx="22"
            cy="22"
            r={RADIUS}
            stroke="currentColor"
            strokeWidth="3.5"
            fill="transparent"
            className="text-surface-elevated"
          />
          {/* Animated progress circle */}
          <circle
            cx="22"
            cy="22"
            r={RADIUS}
            stroke="currentColor"
            strokeWidth="3.5"
            fill="transparent"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeOffset}
            strokeLinecap="round"
            className={`${colorClass} transition-all duration-700 ease-out`}
          />
        </svg>
        {/* Score number inside circle */}
        <span className="absolute font-sans font-bold text-xs text-prime">
          {score != null ? clamped : '--'}
        </span>
      </div>
      <span className="text-[10px] font-semibold text-dim/80 tracking-wider uppercase mt-1">
        Credibility
      </span>
    </div>
  );
}

export default function AnalystBubble({
  guestName,
  firm,
  episodeFocus,
  date,
  trackRecord: initialTrackRecord,
  onSelectGuest,
  className = '',
  nameConfidence = null,
  nameDisclaimer = null,
}) {
  // Synchronous 0ms cache check on initial render
  const cached = getCachedAnalystRecord(guestName) || initialTrackRecord;
  const [record, setRecord] = useState(cached || null);
  const [loading, setLoading] = useState(!cached?.credibilityScore && !cached?.hitRate);

  useEffect(() => {
    let isMounted = true;
    if (!guestName) return;

    // Check synchronous cache first
    const existingCache = getCachedAnalystRecord(guestName) || initialTrackRecord;
    if (existingCache && (existingCache.credibilityScore != null || existingCache.hitRate != null)) {
      setRecord(existingCache);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Always fetch latest Supabase-persisted record in background to stay updated with newest past pick performance
    fetch(`/api/analyst-record?guest=${encodeURIComponent(guestName)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data && (data.credibilityScore != null || data.hitRate != null || Array.isArray(data.picks))) {
          setRecord(data);
          saveCachedAnalystRecord(guestName, data);
        }
      })
      .catch((err) => {
        console.warn('[AnalystBubble] Failed to fetch analyst record:', err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [guestName, initialTrackRecord]);

  if (!guestName) return null;

  /* Calculate overall credibility score (/100) from real data */
  let score = null;
  if (record?.credibilityScore != null) {
    score = Math.round(record.credibilityScore);
  } else if (record?.hitRate != null) {
    score = Math.round(record.hitRate * 100);
  } else if (record?.optimalHorizonHitRate != null) {
    score = Math.round(record.optimalHorizonHitRate * 100);
  }

  return (
    <button
      type="button"
      onClick={() => onSelectGuest && onSelectGuest(guestName)}
      className={`w-full text-left group bg-surface-card rounded-2xl p-5 shadow-antigravity hover:shadow-antigravity-hover border border-surface-elevated/40 hover:border-surface-elevated transition-all font-sans cursor-pointer ${className}`}
      title={`View ${guestName}'s track record & score details`}
    >
      <div className="space-y-3.5">
        {/* Top Header: Identity & Credibility Score Ring */}
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-prime group-hover:text-white transition-colors leading-snug">
                {guestName}
              </h3>
              {nameConfidence === 'audio_only' && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25"
                  title={nameDisclaimer || 'Name heard from live broadcast audio; spelling may vary pending official BNN publication.'}
                >
                  <svg className="w-2.5 h-2.5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                  </svg>
                  <span>Audio Identified</span>
                </span>
              )}
            </div>
            <p className="text-xs text-dim leading-relaxed mt-0.5 text-left">
              {firm || record?.firm || 'BNN MarketCall Guest'}
            </p>
            {date && (
              <span className="text-[10px] text-dim/70 font-medium block mt-1">
                {date}
              </span>
            )}
          </div>

          {/* Credibility Score Circle Ring */}
          <ScoreCircle score={score} loading={loading && score == null} />
        </div>

        {/* Episode Focus */}
        {episodeFocus && (
          <div className="text-xs text-dim bg-surface-elevated/60 px-3.5 py-2.5 rounded-xl leading-relaxed font-sans text-left border border-edge/40">
            <span className="text-[10px] uppercase font-semibold text-dim block mb-0.5 tracking-wider">Episode Focus</span>
            {episodeFocus}
          </div>
        )}
      </div>

      {/* Bottom hint with neutral arrow */}
      <div className="mt-4 pt-3 border-t border-surface-elevated/40 flex items-center justify-between text-xs text-dim group-hover:text-prime transition-colors">
        <span className="font-medium text-dim group-hover:text-prime">View full analyst profile &amp; pick history</span>
        <svg className="w-4 h-4 text-dim group-hover:text-prime group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
