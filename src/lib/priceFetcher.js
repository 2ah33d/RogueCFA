import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * ════════════════════════════════════════════════════════════════
 * src/lib/priceFetcher.js
 * Optimized, zero-LLM client-side stock price fetching layer.
 *
 * Enforces:
 * 1. Single batch page requests (sorted query string for CDN cache hits).
 * 2. 15-minute client-side SWR cache (localStorage + memory).
 * 3. Market hours gating: halts polling on weekends and outside 9:30 AM - 4:00 PM ET.
 * 4. Tab visibility gating: halts polling when document.hidden === true.
 * ════════════════════════════════════════════════════════════════
 */

const CACHE_PREFIX = 'roguecfa_quote_';
export const PRICE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory fallback cache for SSR or environments where localStorage is blocked
const memoryCache = new Map();

/**
 * Helper: Check if North American equity markets (TSX / NYSE / NASDAQ) are currently open.
 * Regular hours: Monday–Friday, 9:30 AM to 4:00 PM Eastern Time.
 */
export function isMarketOpen() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const weekday = parts.find((p) => p.type === 'weekday')?.value;
    const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

    // Closed Saturday and Sunday
    if (weekday === 'Sat' || weekday === 'Sun') {
      return false;
    }

    const currentMinutes = hour * 60 + minute;
    const marketOpenMinutes = 9 * 60 + 30; // 9:30 AM ET
    const marketCloseMinutes = 16 * 60;    // 4:00 PM ET

    return currentMinutes >= marketOpenMinutes && currentMinutes <= marketCloseMinutes;
  } catch {
    return true; // Fallback to open if timezone resolution fails
  }
}

/**
 * Read cached price from localStorage or memory
 */
export function getCachedPrice(ticker) {
  if (!ticker || typeof ticker !== 'string') return null;
  const clean = ticker.trim().toUpperCase();

  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(CACHE_PREFIX + clean) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.price === 'number' && Date.now() - parsed.cachedAt < PRICE_CACHE_TTL_MS) {
        return parsed;
      }
    }
  } catch {
    // localStorage unavailable, check memory
  }

  const mem = memoryCache.get(clean);
  if (mem && Date.now() - mem.cachedAt < PRICE_CACHE_TTL_MS) {
    return mem;
  }

  return null;
}

/**
 * Save price to localStorage and memory
 */
export function setCachedPrice(ticker, quoteData) {
  if (!ticker || !quoteData || typeof quoteData.price !== 'number') return;
  const clean = ticker.trim().toUpperCase();
  const entry = {
    ...quoteData,
    cachedAt: Date.now(),
  };

  memoryCache.set(clean, entry);

  try {
    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHE_PREFIX + clean, JSON.stringify(entry));
    }
  } catch {
    // ignore quota errors
  }
}

/**
 * Batch fetch prices for multiple tickers in a single HTTP request.
 * Normalizes and sorts tickers to ensure exact Vercel Edge cache hits.
 */
export async function fetchBatchStockPrices(tickers = [], force = false) {
  if (!Array.isArray(tickers) || tickers.length === 0) return {};

  const cleanList = Array.from(
    new Set(tickers.map((t) => (typeof t === 'string' ? t.trim().toUpperCase() : '')))
  )
    .filter(Boolean)
    .sort();

  const results = {};
  const toFetch = [];

  for (const t of cleanList) {
    if (!force) {
      const cached = getCachedPrice(t);
      if (cached) {
        results[t] = cached;
        continue;
      }
    }
    toFetch.push(t);
  }

  if (toFetch.length === 0) {
    return results;
  }

  try {
    // Alphabetize to match server edge-cache URL normalization
    const sortedParam = toFetch.slice().sort().join(',');
    const res = await fetch(`/api/quote?tickers=${encodeURIComponent(sortedParam)}`);
    if (res.ok) {
      const data = await res.json();
      const quotes = data?.quotes || {};

      for (const t of toFetch) {
        const q = quotes[t];
        if (q && typeof q.price === 'number') {
          setCachedPrice(t, q);
          results[t] = q;
        } else {
          results[t] = null;
        }
      }
    }
  } catch (err) {
    console.warn('[priceFetcher] Batch fetch error:', err.message);
  }

  return results;
}

/**
 * Fetch price for a single stock ticker with 15-minute caching.
 */
export async function fetchStockPrice(ticker, force = false) {
  if (!ticker || typeof ticker !== 'string') return null;
  const clean = ticker.trim().toUpperCase();

  if (!force) {
    const cached = getCachedPrice(clean);
    if (cached) return cached;
  }

  const batchMap = await fetchBatchStockPrices([clean], force);
  return batchMap[clean] || null;
}

/**
 * Format price and currency cleanly for display
 * e.g. "$60.90 CAD" or "$333.02 USD"
 */
export function formatStockPrice(price, currency = 'CAD') {
  if (typeof price !== 'number' || isNaN(price)) return null;

  const formattedNum = price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const curr = (currency || 'CAD').toUpperCase();
  return `$${formattedNum} ${curr}`;
}

/**
 * React Hook: useBatchLivePrices
 * Primary hook for parent containers (GoldenGoosePanel, DigestView).
 * Aggregates all visible tickers into a single batch request and manages
 * 15-minute polling with market hours and tab-visibility gating.
 */
export function useBatchLivePrices(tickers = [], { enabled = true } = {}) {
  // Normalize and sort tickers for stable memoization
  const cleanTickers = useMemo(() => {
    return Array.from(
      new Set(tickers.map((t) => (typeof t === 'string' ? t.trim().toUpperCase() : '')))
    )
      .filter(Boolean)
      .sort();
  }, [tickers]);

  const tickersKey = cleanTickers.join(',');

  const [quotes, setQuotes] = useState(() => {
    const initial = {};
    for (const t of cleanTickers) {
      const c = getCachedPrice(t);
      if (c) initial[t] = c;
    }
    return initial;
  });

  const [loading, setLoading] = useState(false);

  const loadBatch = useCallback(
    async (force = false) => {
      if (cleanTickers.length === 0 || !enabled) return;

      if (!force) {
        // If all are already cached, populate and skip network
        const allCached = cleanTickers.every((t) => !!getCachedPrice(t));
        if (allCached) {
          const map = {};
          cleanTickers.forEach((t) => {
            map[t] = getCachedPrice(t);
          });
          setQuotes(map);
          return;
        }
      }

      setLoading(true);
      const batchData = await fetchBatchStockPrices(cleanTickers, force);
      setQuotes((prev) => ({ ...prev, ...batchData }));
      setLoading(false);
    },
    [cleanTickers, enabled]
  );

  useEffect(() => {
    if (cleanTickers.length === 0 || !enabled) return;

    // Initial passive fetch (hits cache or executes batch)
    loadBatch(false);

    // 15-minute polling loop with gating
    const timer = setInterval(() => {
      // Gate 1: Tab must be visible
      const isVisible = typeof document !== 'undefined' && !document.hidden;
      // Gate 2: Markets must be currently open
      const isOpen = isMarketOpen();

      if (isVisible && isOpen) {
        loadBatch(true);
      }
    }, PRICE_CACHE_TTL_MS);

    // Visibility change handler: refresh when user returns to tab if market is open
    const handleVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden && isMarketOpen()) {
        const someExpired = cleanTickers.some((t) => !getCachedPrice(t));
        if (someExpired) {
          loadBatch(false);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [tickersKey, enabled, loadBatch, cleanTickers]);

  return {
    quotes,
    loading,
    getPrice: (t) => (t ? quotes[t.trim().toUpperCase()] : null),
    formatTickerPrice: (t) => {
      if (!t) return null;
      const q = quotes[t.trim().toUpperCase()];
      return q ? formatStockPrice(q.price, q.currency) : null;
    },
    refetch: () => loadBatch(true),
  };
}

/**
 * React Hook: useLivePrice
 * Single-ticker hook that reads synchronously from client cache.
 */
export function useLivePrice(ticker, { enabled = true } = {}) {
  const clean = ticker ? ticker.trim().toUpperCase() : '';
  const batchTickers = useMemo(() => (clean ? [clean] : []), [clean]);
  const { quotes, loading, refetch } = useBatchLivePrices(batchTickers, { enabled: Boolean(clean && enabled) });

  const quote = quotes[clean] || getCachedPrice(clean) || null;

  return {
    quote,
    price: quote?.price ?? null,
    currency: quote?.currency ?? 'CAD',
    formattedPrice: quote ? formatStockPrice(quote.price, quote.currency) : null,
    loading,
    refetch,
  };
}
