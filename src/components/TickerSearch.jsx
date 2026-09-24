import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Calendar, User, ArrowUpDown, Filter, ChevronDown, Sparkles } from 'lucide-react';

const POPULAR_TICKERS = ['UBER', 'RY', 'ENB', 'TD', 'SHOP', 'CPX', 'WSP', 'BMO', 'CNQ', 'AAPL'];

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
  const [expandedIds, setExpandedIds] = useState(new Set());

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

  // Fetch initial results when debounced query, sort, or filter changes
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setOffset(0);

    const params = new URLSearchParams({
      q: debouncedQuery,
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
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);

    const nextOffset = offset + 20;
    const params = new URLSearchParams({
      q: debouncedQuery,
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

  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const formatDate = (dateStr) => {
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
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 font-sans">
      {/* ── Search Header Card ── */}
      <div className="bg-surface-card rounded-2xl p-6 md:p-8 shadow-antigravity border border-edge/60 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🔍</span>
              <h2 className="text-lg font-bold text-prime tracking-tight">Ticker & Stock Search</h2>
              <span className="px-2.5 py-0.5 text-[10px] font-sans font-semibold uppercase bg-accent/15 border border-accent/30 text-accent rounded-full">
                Broadcast Archive
              </span>
            </div>
            <p className="text-xs text-dim">
              Explore historical analyst calls, top picks, and caller Q&A commentary across all recorded shows.
            </p>
          </div>

          {totalCount > 0 && (
            <div className="self-start sm:self-auto px-3.5 py-1.5 bg-surface-elevated/70 border border-edge rounded-full text-xs text-dim">
              <span className="font-bold text-prime mr-1">{totalCount}</span>
              <span>mention{totalCount === 1 ? '' : 's'} found</span>
            </div>
          )}
        </div>

        {/* Search input bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-dim">
            <Search className="w-5 h-5 text-dim/70" />
          </div>

          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ticker or company (e.g. UBER, RY, SHOP, Enbridge)..."
            className="w-full pl-12 pr-10 py-3.5 bg-surface-elevated rounded-xl
                       text-prime text-base font-bold font-sans placeholder:font-normal placeholder:text-dim/40
                       focus:outline-none focus:ring-1 focus:ring-accent/50 transition-all shadow-inner"
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

        {/* Quick popular ticker chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-dim/70 mr-1 flex items-center gap-1">
            <span>Popular:</span>
          </span>
          {POPULAR_TICKERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setQuery(t)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                query.toUpperCase() === t
                  ? 'bg-accent text-accent-text shadow-sm'
                  : 'bg-surface-elevated/60 hover:bg-surface-elevated text-dim hover:text-prime border border-white/[0.04]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Controls: Sort Order & Stance Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-edge/40 text-xs">
          {/* Stance Filter Pills */}
          <div className="flex items-center gap-1.5">
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
                    ? 'bg-surface-elevated text-prime border border-white/20 shadow-sm'
                    : 'text-dim hover:text-prime hover:bg-surface-elevated/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort Order Toggle */}
          <div className="flex items-center gap-1 bg-surface-elevated/50 p-1 rounded-xl border border-edge/40">
            <button
              type="button"
              onClick={() => setSortOrder('latest')}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                sortOrder === 'latest'
                  ? 'bg-surface-card text-prime shadow-sm border border-white/10'
                  : 'text-dim hover:text-prime'
              }`}
            >
              <span>Latest First</span>
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('oldest')}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                sortOrder === 'oldest'
                  ? 'bg-surface-card text-prime shadow-sm border border-white/10'
                  : 'text-dim hover:text-prime'
              }`}
            >
              <span>Oldest First</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Search Results List ── */}
      {loading ? (
        <div className="bg-surface-card border border-edge rounded-2xl p-12 text-center text-dim space-y-3 shadow-antigravity">
          <svg className="w-6 h-6 mx-auto animate-spin text-accent" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <p className="text-xs">Searching broadcast archive...</p>
        </div>
      ) : results.length > 0 ? (
        <div className="space-y-3">
          {results.map((mention) => {
            const isExpanded = expandedIds.has(mention.id);
            const stance = (mention.stance || '').toLowerCase();
            const isTopPick = mention.segment === 'Top Pick';

            return (
              <div
                key={mention.id}
                className="bg-surface-card hover:bg-surface-card/95 border border-edge/60 hover:border-white/[0.09] rounded-2xl p-5 shadow-antigravity transition-all space-y-3"
              >
                {/* Header row: Ticker, Company, Stance Badge, Segment */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-extrabold text-prime tracking-wide">
                        {mention.ticker}
                      </span>
                      <span className="text-xs text-dim font-medium">
                        {mention.company !== mention.ticker ? mention.company : ''}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-dim/70 pt-0.5">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-dim/50" />
                        <span>{formatDate(mention.date)}</span>
                      </span>
                      <span>•</span>
                      <span className="inline-flex items-center gap-1">
                        <User className="w-3 h-3 text-dim/50" />
                        <button
                          type="button"
                          onClick={() => onSelectGuest && onSelectGuest(mention.guest)}
                          className="hover:text-amber-400 underline decoration-dotted transition-colors cursor-pointer"
                        >
                          {mention.guest}
                        </button>
                      </span>
                      <span>•</span>
                      <span className="px-2 py-0.2 rounded-full text-[10px] bg-surface-elevated text-dim/80">
                        {mention.segment}
                      </span>
                    </div>
                  </div>

                  {/* Stance Badge */}
                  <div className="shrink-0">
                    {isTopPick ? (
                      <span className="px-3 py-1 text-[10px] font-bold uppercase rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                        BUY (TOP PICK)
                      </span>
                    ) : stance === 'buy' ? (
                      <span className="px-3 py-1 text-[10px] font-bold uppercase rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        BUY
                      </span>
                    ) : stance === 'hold' ? (
                      <span className="px-3 py-1 text-[10px] font-bold uppercase rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300">
                        HOLD
                      </span>
                    ) : (
                      <span className="px-3 py-1 text-[10px] font-bold uppercase rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        SELL
                      </span>
                    )}
                  </div>
                </div>

                {/* Commentary body */}
                <div className="bg-surface-elevated/40 border border-white/[0.03] rounded-xl p-3.5 text-xs text-dim leading-relaxed">
                  <p className="italic text-dim/95">
                    "{mention.reasoning}"
                  </p>
                </div>
              </div>
            );
          })}

          {/* Load More Button */}
          {hasMore && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-surface-card hover:bg-surface-elevated border border-edge rounded-full text-xs font-semibold text-prime hover:text-white transition-all shadow-antigravity disabled:opacity-50 cursor-pointer inline-flex items-center gap-2"
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
                    <span className="text-dim text-[11px]">({results.length} of {totalCount})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-surface-card border border-edge rounded-2xl p-10 text-center text-dim space-y-3 shadow-antigravity">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-surface-elevated flex items-center justify-center text-xl text-dim">
            🔍
          </div>
          <h3 className="text-sm font-bold text-prime">
            {debouncedQuery ? `No mentions found for "${debouncedQuery}"` : 'No mentions found'}
          </h3>
          <p className="text-xs text-dim max-w-sm mx-auto">
            {debouncedQuery
              ? 'Try searching by ticker (e.g. RY, TD, UBER) or general company name (e.g. Bank, Energy, Tech).'
              : 'Type a ticker or select one of the popular chips above to explore broadcast commentary.'}
          </p>
        </div>
      )}
    </div>
  );
}
