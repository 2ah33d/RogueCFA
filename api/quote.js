/* ════════════════════════════════════════════════════════════════
   /api/quote.js
   Hardened, zero-LLM stock quote proxy powered by Yahoo Finance chart API
   with circuit-breaker fallback to Finnhub strictly for US symbols.
   
   Edge-cached with s-maxage=900 (15 minutes) and stale-while-revalidate=120
   to protect Vercel Hobby plan compute quota and prevent CDN fragmentation.
   ════════════════════════════════════════════════════════════════ */

export const config = { maxDuration: 10 };

// Short in-memory cache within the serverless container instance
const memoryCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fallback to Finnhub strictly for US symbols if Yahoo fails.
 * Finnhub free tier strictly returns 403 for TSX stocks, so gate to US only.
 */
async function fetchFinnhubFallback(cleanTicker) {
  if (!cleanTicker || cleanTicker.endsWith('.TO') || cleanTicker.endsWith('.V') || cleanTicker.includes('.')) {
    return null;
  }

  const finnhubKey = process.env.FINNHUB_KEY || process.env.VITE_FINNHUB_KEY;
  if (!finnhubKey) return null;

  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(cleanTicker)}&token=${encodeURIComponent(finnhubKey)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (data && typeof data.c === 'number' && data.c > 0) {
      return {
        symbol: cleanTicker,
        requestedTicker: cleanTicker,
        price: Number(data.c.toFixed(2)),
        currency: 'USD',
        previousClose: typeof data.pc === 'number' ? Number(data.pc.toFixed(2)) : null,
        timestamp: Date.now(),
        source: 'finnhub',
      };
    }
  } catch {
    // Ignore fallback failures
  }

  return null;
}

const CANADIAN_TITANS = new Set([
  'RY', 'TD', 'BMO', 'BNS', 'CM', 'ENB', 'TRP', 'SU', 'CNQ', 'CNR', 'CP', 'BCE', 'T',
  'RCI', 'ATZ', 'SHOP', 'CSU', 'L', 'DOL', 'POW', 'MFC', 'SLF', 'BAM', 'BN', 'NTR',
  'WCN', 'OTEX', 'TRI', 'TOU', 'ARX', 'IMO', 'CVE', 'GWO', 'IFC', 'EMA', 'FTS', 'AQN',
  'WN', 'MRU', 'CTC', 'MG', 'CCL', 'QSR', 'CCA', 'CGO', 'CJR', 'EFN', 'EIF', 'TIH',
  'WSP', 'STN', 'GFL', 'K', 'ABX', 'AEM', 'FNV', 'WPM', 'NPI', 'BLX', 'INE', 'CPX'
]);

/**
 * Fetch quote from Yahoo Finance chart endpoint with smart fallback for TSX.
 */
async function fetchYahooQuote(rawTicker) {
  if (!rawTicker || typeof rawTicker !== 'string') return null;

  const clean = rawTicker.trim().toUpperCase();
  if (!clean) return null;

  // Check in-process cache
  const cached = memoryCache.get(clean);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Build candidate symbols:
  // If user already specified an exchange (e.g. SHOP.TO or AAPL.US), query that directly.
  // If ticker is a known Canadian titan or ends with TSX marker, prioritize .TO first.
  const isCanadianTitan = CANADIAN_TITANS.has(clean.replace(/\.(TO|TSX|V|CN)$/i, ''));
  const candidates = clean.includes('.')
    ? [clean]
    : isCanadianTitan
    ? [`${clean}.TO`, clean]
    : [clean, `${clean}.TO`];

  for (const symbol of candidates) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;

      if (meta && typeof meta.regularMarketPrice === 'number' && meta.regularMarketPrice > 0) {
        const isCad = symbol.endsWith('.TO') || symbol.endsWith('.V') || symbol.endsWith('.CN') || meta.currency === 'CAD';
        const quote = {
          symbol: meta.symbol || symbol,
          requestedTicker: clean,
          price: Number(meta.regularMarketPrice.toFixed(2)),
          currency: isCad ? 'CAD' : (meta.currency || 'USD'),
          market: isCad ? 'CAD' : 'US',
          previousClose: typeof meta.chartPreviousClose === 'number' ? Number(meta.chartPreviousClose.toFixed(2)) : null,
          timestamp: meta.regularMarketTime ? meta.regularMarketTime * 1000 : Date.now(),
          source: 'yahoo',
        };

        memoryCache.set(clean, { data: quote, cachedAt: Date.now() });
        return quote;
      }
    } catch {
      // Continue to next candidate
    }
  }

  // If Yahoo fails and ticker is US, try Finnhub fallback
  const finnhubQuote = await fetchFinnhubFallback(clean);
  if (finnhubQuote) {
    finnhubQuote.market = 'US';
    memoryCache.set(clean, { data: finnhubQuote, cachedAt: Date.now() });
    return finnhubQuote;
  }

  return null;
}

export default async function handler(req, res) {
  // CORS & Caching Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Edge cache: 15 minutes (900 seconds) in Vercel CDN, stale-while-revalidate for 120s
  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=120');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, tickers } = req.query;

  if (!ticker && !tickers) {
    return res.status(400).json({ error: 'Query parameter "ticker" or "tickers" is required.' });
  }

  // 1. Query String Normalization: Alphabetize and uppercase to prevent Vercel Edge cache fragmentation
  const rawList = tickers ? tickers.split(',') : [ticker];
  const sortedTickers = Array.from(
    new Set(rawList.map((t) => t.trim().toUpperCase()).filter(Boolean))
  )
    .sort()
    .slice(0, 50); // Capped at 50 to cover full episode with 3 top picks + 20 caller mentions

  try {
    // 2. Error Boundaries with Promise.allSettled: Ensures single delisted ticker doesn't fail the batch
    const settledResults = await Promise.allSettled(
      sortedTickers.map((t) => fetchYahooQuote(t))
    );

    const quotes = {};
    for (let i = 0; i < sortedTickers.length; i++) {
      const t = sortedTickers[i];
      const outcome = settledResults[i];

      if (outcome.status === 'fulfilled' && outcome.value) {
        const val = outcome.value;
        quotes[t] = val;
        // Also cross-index with stripped .TO or added .TO for instant cache hits
        const base = t.replace(/\.(TO|TSX)$/i, '');
        if (!quotes[base]) quotes[base] = val;
        if (val.symbol && !quotes[val.symbol]) quotes[val.symbol] = val;
      } else {
        quotes[t] = { requestedTicker: t, price: null, error: 'Price unavailable' };
      }
    }

    // Single ticker convenience return
    if (ticker && quotes[sortedTickers[0]]) {
      return res.status(200).json({
        ...quotes[sortedTickers[0]],
        quotes,
      });
    }

    return res.status(200).json({ quotes });
  } catch (err) {
    console.error('[/api/quote] Internal Error:', err);
    return res.status(500).json({ error: 'Failed to process quote batch', message: err.message });
  }
}
