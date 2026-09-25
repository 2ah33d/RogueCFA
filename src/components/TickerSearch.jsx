import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Calendar, User, Filter, ArrowUpDown } from 'lucide-react';

/**
 * Render a color-coded stance flag badge based on analyst evaluation
 * Matches the exact flag styling from DigestPickCard.
 */
function renderStanceFlag(stance) {
  if (!stance) return null;
  const s = String(stance).toLowerCase().trim();

  if (s.includes('buy')) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-emerald-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
        </svg>
        <span>BUY</span>
      </span>
    );
  }
  if (s.includes('sell') || s.includes('avoid')) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/15 text-rose-400 border border-rose-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-rose-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
        </svg>
        <span>SELL</span>
      </span>
    );
  }
  if (s.includes('hold') || s.includes('neutral')) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 shrink-0">
        <svg className="w-3 h-3 fill-current text-amber-400" viewBox="0 0 24 24">
          <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
        </svg>
        <span>HOLD</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-500/15 text-slate-400 border border-slate-500/30 shrink-0">
      <svg className="w-3 h-3 fill-current text-slate-400" viewBox="0 0 24 24">
        <path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z" />
      </svg>
      <span>MENTION</span>
    </span>
  );
}

/**
 * Format YYYY-MM-DD into "Sep 24, 2026"
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === 'Recent') return 'Recent';
  try {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) {
      const dt = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

/**
 * Highlight matching search keywords inside text cleanly with blue theme styling
 */
function HighlightMatch({ text, query }) {
  if (!text || !query) return <>{text}</>;
  const terms = query.trim().split(/\s+/).filter((t) => t.length >= 2);
  if (terms.length === 0) return <>{text}</>;

  try {
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = String(text).split(regex);

    return (
      <>
        {parts.map((part, i) =>
          regex.test(part) ? (
            <mark key={i} className="bg-accent/30 text-prime font-semibold px-0.5 rounded">
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  } catch {
    return <>{text}</>;
  }
}

/**
 * Individual Mention Card — 2-column grid layout styled consistently with daily digest bubbles
 */
function MentionCard({ mention, searchQuery, onSelectGuest }) {
  const [expanded, setExpanded] = useState(false);
  const reasoning = mention.reasoning || '';
  const isLong = reasoning.length > 180;
  const displayText = !isLong || expanded ? reasoning : `${reasoning.slice(0, 180).trim()}…`;

  return (
    <div className="bg-surface-card rounded-2xl p-5 shadow-antigravity border border-surface-elevated/40 hover:border-surface-elevated transition-all flex flex-col justify-between space-y-3 font-sans">
      <div className="space-y-2.5">
        {/* Top Header: Ticker pill, Segment pill, Stance Flag */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center font-bold text-sm text-prime bg-surface-elevated px-3.5 py-1 rounded-full">
              {mention.ticker}
            </span>
            {mention.segment && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-elevated/70 text-dim">
                {mention.segment}
              </span>
            )}
            {mention.matchedField === 'reasoning' && (
              <span className="text-[10px] font-medium text-accent bg-accent/15 px-2 py-0.5 rounded-full border border-accent/25">
                Keyword in Thesis
              </span>
            )}
            {mention.matchedField === 'guest' && (
              <span className="text-[10px] font-medium text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded-full border border-amber-500/25">
                Analyst Match
              </span>
            )}
          </div>
          <div>{renderStanceFlag(mention.stance)}</div>
        </div>

        {/* Company Title */}
        <h4 className="text-base font-semibold text-prime truncate leading-snug">
          <HighlightMatch text={mention.company || mention.ticker} query={searchQuery} />
        </h4>

        {/* Episode Date & Guest Analyst Link */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-dim">
          <span className="inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-dim/60" />
            <span>{formatDate(mention.date)}</span>
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <User className="w-3.5 h-3.5 text-dim/60" />
            <button
              type="button"
              onClick={() => onSelectGuest && onSelectGuest(mention.guest)}
              className="text-dim hover:text-accent font-medium transition-colors cursor-pointer"
              title={`View ${mention.guest}'s track record`}
            >
              <HighlightMatch text={mention.guest} query={searchQuery} />
            </button>
          </span>
        </div>

        {/* Analyst Commentary with Legible Blue Accent Border */}
        <div className="bg-surface-elevated/50 border-l-2 border-accent rounded-r-xl p-3.5 text-xs text-prime/90 leading-relaxed font-sans">
          <p className="italic">
            "<HighlightMatch text={displayText} query={searchQuery} />"
          </p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="mt-1.5 text-[11px] font-semibold text-accent hover:underline cursor-pointer block"
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TickerSearch({ prefilledTicker = '', onSelectGuest }) {
  const [query, setQuery] = useState(prefilledTicker || '');
  const [debouncedQuery, setDebouncedQuery] = useState(prefilledTicker || '');
  const [sortOrder, setSortOrder] = useState('latest'); // 'latest' | 'oldest'
  const [stanceFilter, setStanceFilter] = useState('all'); // 'all' | 'buy' | 'hold' | 'sell'
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Debounce search query by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Sync external prefilledTicker prop
  useEffect(() => {
    if (prefilledTicker) {
      setQuery(prefilledTicker);
      setDebouncedQuery(prefilledTicker);
    }
  }, [prefilledTicker]);

  // Fetch results when debounced query, sort, or filter changes
  useEffect(() => {
    const trimmed = debouncedQuery.trim();

    // Do NOT fetch or show any results if search is empty
    if (!trimmed) {
      setResults([]);
      setTotalCount(0);
      setHasMore(false);
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setOffset(0);

    const params = new URLSearchParams({
      q: trimmed,
      sort: sortOrder,
      stance: stanceFilter,
      limit: '20',
      offset: '0',
    });

    fetch(`/api/ticker-search?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isCancelled) return;
        if (data && Array.isArray(data.results)) {
          setResults(data.results);
          setTotalCount(data.total || 0);
          setHasMore(Boolean(data.hasMore));
        } else {
          setResults([]);
          setTotalCount(0);
          setHasMore(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.warn('[TickerSearch] Fetch error:', err);
          setResults([]);
          setTotalCount(0);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [debouncedQuery, sortOrder, stanceFilter]);

  // Fetch next page of results
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !debouncedQuery.trim()) return;
    setLoadingMore(true);

    const nextOffset = offset + 20;
    const params = new URLSearchParams({
      q: debouncedQuery.trim(),
      sort: sortOrder,
      stance: stanceFilter,
      limit: '20',
      offset: String(nextOffset),
    });

    try {
      const res = await fetch(`/api/ticker-search?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.results)) {
          setResults((prev) => [...prev, ...data.results]);
          setOffset(nextOffset);
          setHasMore(Boolean(data.hasMore));
        }
      }
    } catch (err) {
      console.warn('[TickerSearch] Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, offset, debouncedQuery, sortOrder, stanceFilter]);

  const hasSearchQuery = Boolean(debouncedQuery.trim());

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 font-sans">
      {/* ── Search Header Card (Consistent with Daily Digest styling) ── */}
      <div className="bg-surface-card rounded-2xl p-6 md:p-7 shadow-antigravity border border-surface-elevated/40 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h2 className="text-lg font-bold text-prime tracking-tight">Broadcast Archive Search</h2>
              <span className="px-2.5 py-0.5 text-[10px] font-semibold uppercase bg-accent/15 border border-accent/30 text-accent rounded-full">
                Database
              </span>
            </div>
            <p className="text-xs text-dim">
              Search 2 months of analyst calls by ticker, company name, colloquial alias (e.g. RBC), guest analyst, or commentary keywords.
            </p>
          </div>

          {hasSearchQuery && totalCount > 0 && (
            <div className="self-start sm:self-auto px-3.5 py-1 bg-accent/15 border border-accent/30 rounded-full text-xs text-accent">
              <span className="font-bold mr-1">{totalCount}</span>
              <span>mention{totalCount === 1 ? '' : 's'} found</span>
            </div>
          )}
        </div>

        {/* Search input bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-dim">
            <Search className="w-4 h-4 text-dim/70" />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker, company, alias, guest, or keyword (e.g. RY, RBC, royal bank, dividend, Caldwell, oil)..."
            className="w-full pl-11 pr-10 py-3 bg-surface-elevated rounded-xl
                       text-prime text-sm font-semibold font-sans placeholder:font-normal placeholder:text-dim/50
                       focus:outline-none focus:ring-2 focus:ring-accent/40 transition-all shadow-inner border border-transparent"
            autoComplete="off"
            spellCheck="false"
          />

          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setDebouncedQuery('');
              }}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-dim hover:text-prime transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Controls: Stance Filter & Sort Order */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-surface-elevated/40 text-xs">
          {/* Stance Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-dim text-[11px] mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-dim/60" />
              <span>Stance:</span>
            </span>
            {[
              { id: 'all', label: 'All' },
              { id: 'buy', label: 'Buy' },
              { id: 'hold', label: 'Hold' },
              { id: 'sell', label: 'Sell' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStanceFilter(f.id)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                  stanceFilter === f.id
                    ? 'bg-accent text-accent-text shadow-sm shadow-accent/20'
                    : 'bg-surface-elevated/50 text-dim hover:text-prime hover:bg-surface-elevated'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort Order Toggle */}
          <div className="flex items-center gap-1 bg-surface-elevated/50 p-1 rounded-xl border border-surface-elevated/40">
            <button
              type="button"
              onClick={() => setSortOrder('latest')}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                sortOrder === 'latest'
                  ? 'bg-accent text-accent-text shadow-sm shadow-accent/20'
                  : 'text-dim hover:text-prime'
              }`}
            >
              Latest First
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('oldest')}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                sortOrder === 'oldest'
                  ? 'bg-accent text-accent-text shadow-sm shadow-accent/20'
                  : 'text-dim hover:text-prime'
              }`}
            >
              Oldest First
            </button>
          </div>
        </div>
      </div>

      {/* ── Search Results List ── */}
      {loading ? (
        <div className="bg-surface-card border border-surface-elevated/40 rounded-2xl p-12 text-center text-dim space-y-3 shadow-antigravity">
          <svg className="w-6 h-6 mx-auto animate-spin text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-xs">Searching 2-month broadcast archive...</p>
        </div>
      ) : !hasSearchQuery ? (
        /* Empty Query State — Helpful clean invite card */
        <div className="bg-surface-card border border-surface-elevated/40 rounded-2xl p-10 text-center text-dim space-y-3.5 shadow-antigravity max-w-xl mx-auto">
          <div className="w-10 h-10 mx-auto rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-prime">Search 2 Months of Broadcast History</h3>
          <p className="text-xs text-dim leading-relaxed max-w-md mx-auto">
            Search by ticker (e.g. <span className="text-prime font-semibold">RY</span>), company or colloquial alias (e.g. <span className="text-prime font-semibold">RBC</span>, <span className="text-prime font-semibold">Scotiabank</span>), guest analyst (e.g. <span className="text-prime font-semibold">Caldwell</span>), or investment thesis keyword (e.g. <span className="text-prime font-semibold">dividend</span>, <span className="text-prime font-semibold">oil</span>, <span className="text-prime font-semibold">AI</span>).
          </p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-4">
          {/* 2-Column Grid Format */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((mention) => (
              <MentionCard
                key={mention.id}
                mention={mention}
                searchQuery={debouncedQuery}
                onSelectGuest={onSelectGuest}
              />
            ))}
          </div>

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-3 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2 bg-surface-card hover:bg-surface-elevated border border-surface-elevated/60 rounded-full text-xs font-semibold text-prime hover:text-white transition-all shadow-antigravity disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
              >
                {loadingMore ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>Loading more mentions...</span>
                  </>
                ) : (
                  <>
                    <span>More Results</span>
                    <span className="text-dim text-[11px]">
                      ({results.length} of {totalCount})
                    </span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Zero Results Found for Active Query */
        <div className="bg-surface-card border border-surface-elevated/40 rounded-2xl p-10 text-center text-dim space-y-3 shadow-antigravity max-w-xl mx-auto">
          <div className="w-10 h-10 mx-auto rounded-full bg-surface-elevated flex items-center justify-center text-dim">
            <Search className="w-5 h-5 text-dim/70" />
          </div>
          <h3 className="text-sm font-bold text-prime">
            No mentions found for "{debouncedQuery}"
          </h3>
          <p className="text-xs text-dim leading-relaxed max-w-sm mx-auto">
            Try searching by Canadian/US ticker (e.g. RY, TD, UBER), company alias (e.g. RBC, Scotiabank), guest analyst (e.g. Caldwell), or investment topic (e.g. dividend, energy).
          </p>
        </div>
      )}
    </div>
  );
}
